const axios = require('axios');
const parseLinkHeader = require('parse-link-header');

//Environment Params
const apiBaseUrl = process.env.API_ROOT,
      apiToken = process.env.API_TOKEN;

//Setup the Axios client
const apiClient = axios.create({
    baseURL: apiBaseUrl,
    timeout: 10000,
    headers: {'Authorization': 'Bearer ' + apiToken}
});


//Helper functions

/**
 * Function for making requests to Canvas API; handles paging, etc.
 * 
 * @param {string} urlPrefix Main portion of endpoint URL, excluding leading slash
 * @param {Array} queryParams Array of objects where the key/value pairs become query params on the request (i.e., {"enrollment_type[]":"student"} )
 * @param {string} requestType Request type (GET, POST, PUT, DELETE)
 * @param {object} data Request payload
 */
async function canvasRequest(urlPrefix, queryParams = [], requestType = 'GET', data = null) {
    let url = `${apiBaseUrl}${urlPrefix}?per_page=50`;
    for (let queryParam of queryParams) {
        url += `&${encodeURIComponent(queryParam.key)}=${encodeURIComponent(queryParam.value)}`;
    }
    let response = null;
    let returnedData = [];
    let requestsRemaining = true;
    let nextPaginationLink = false;
    let requestsMade = 0;

    while (requestsRemaining) {
        try {
            if (requestType === 'GET') {
                response = await apiClient.get(url);
            }
            else if (requestType === 'POST') {
                response = await apiClient.post(url, data);
            }
            else if (requestType === 'PUT') {
                response = await apiClient.put(url, data);
            }
            else if (requestType === 'DELETE') {
                response = await apiClient.delete(url);
            }

            //if an array, we may need to combine paginated results;
            //otherwise, just return the single or empty resource as is
            if (Array.isArray(response.data)) {
                returnedData = returnedData.concat(response.data);
            }
            else {
                returnedData = response.data;
            }

            requestsMade++;
            nextPaginationLink = getNextPaginationLink(response);

            if (!nextPaginationLink) {
                requestsRemaining = false;
            }
            else {
                url = nextPaginationLink.url;
            }

            //fail-safe here so we don't accidentally end up in an infinite loop or
            //land upon some Canvas resource that is too huge for us to handle
            if (requestsMade > 50) {
                throw new Error('Exiting Canvas API, too many requests made to url: ' + url);
            }
        }
        catch (error) {
            requestsRemaining = false;
            const message = 'Error from URL ' + url + ': ' + error.message;
            returnedData = message;
            console.error(new Error(message));
        }
    }

    return returnedData;
}


/**
 * Given a Canvas API response, find and return the next pagination link in paged results
 * 
 * @param {object} response Canvas API response
 * 
 * @returns {mixed} The pagination link as a string, or false if none found. 
 */
function getNextPaginationLink(response) {
    const paginationLink = response.headers.link;
    let nextPaginationLink = false;

    if (paginationLink) {
        const parsedPaginationLink = parseLinkHeader(paginationLink);
        nextPaginationLink = parsedPaginationLink.next;
    }

    return nextPaginationLink;
}



/**
 * Shuffles array in place. ES6 version
 * https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array
 * 
 * @param {Array} a An array containing the items.
 */
function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}


/**
 * Creates a section in a canvas course
 * 
 * @param {int} sectionName Name of the new section
 * @param {int} courseId Canvas course ID
 * 
 * @returns section JSON on success, false on failure
 */
async function createSectionInCourse(sectionName, courseId) {
    try {
        let newSection = await canvasRequest('courses/' + courseId + '/sections', [{'key':'course_section[name]', 'value':sectionName}], 'POST');
        return newSection;
    } catch (error) {
        console.error(new Error(`Error creating section '${sectionName}' in course ${courseId}, API returned: ${error.message}`));
        return false;
    }
}


/**
 * Enrolls a canvas user ID in a section ID as a student
 * https://canvas.instructure.com/doc/api/enrollments.html#method.enrollments_api.create
 * 
 * @param {int} userId Canvas user ID
 * @param {int} sectionId Canvas section ID
 * 
 * @returns enrollment JSON on success, false on failure
 */
async function enrollStudentInSection(userId, sectionId) {
    try {
        let response = await canvasRequest('sections/' + sectionId + '/enrollments', [{'key':'enrollment[type]','value':'StudentEnrollment'}, {'key':'enrollment[user_id]','value':userId}], 'POST');
        return response;
    } catch(error) {
        console.error(new Error(`Error enrolling user '${userId}' in section ${sectionId}, API returned: ${error.message}`));
        return false;
    }
}


/**
 * Retrieve enrollment object by section ID and user ID
 * TODO: Not currently used. Remove?
 * 
 * @param {int} userId Canvas user ID
 * @param {int} sectionId Canvas section ID
 * 
 * @returns enrollment JSON on success, false on failure
 */
async function getEnrollmentByUserAndSection(userId, sectionId) {
    try {
        let response = await canvasRequest('sections/' + sectionId + '/enrollments', [{'key':'user_id','value':userId}]);
        return response[0]; //Note, API returns array even though only 1 enrollment should ever be returned. So return first array item.
    } catch(error) {
        console.error(new Error(`Error retrieving enrollment for user id '${userId}' in section ${sectionId}, API returned: ${error.message}`));
        return false;
    }
}


/**
 * Delete an enrollment from a course ID by enrollment ID 
 * 
 * @param {int} courseId Canvas course ID
 * @param {int} enrollmentId Canvas enrollment ID
 * 
 * @returns deleted enrollment JSON on success, false on failure
 */
async function deleteEnrollmentFromCourse(courseId, enrollmentId) {
    try {
        let response = await canvasRequest('courses/' + courseId + '/enrollments/' + enrollmentId, [{'key':'task','value':'delete'}], 'DELETE');
        return response;
    } catch(error) {
        console.error(new Error(`Error deleting enrollment id '${enrollmentId}' from course ${courseId}, API returned: ${error.message}`));
        return false;
    }
}


/**
 * Returns the index of the array element with the lowest value, or -1 if they are all the same 
 * https://blogs.msdn.microsoft.com/oldnewthing/20140526-00/?p=903
 * https://stackoverflow.com/questions/14832603/check-if-all-values-of-array-are-equal
 * 
 * @param {array} a Array ints
 * 
 * @returns {int} index of element with lowest value, or -1 if all elements are equal.
 */
function indexOfSmallestArrayElement(a) {
    let lowestIndex = 0;

    //If elements are all the same, return -1
    if(a.every( (val, i, arr) => val === arr[0] )) {
        return -1;
    } 

    // Assume the first index has the smallest value. 
    // With each iteration of the loop, compare to the value at this index.
    // If one is found to be lower, that index becomes the lowestIndex. Wash rinse repeat.
    for (let i = 1; i < a.length; i++) {
        if (a[i] < a[lowestIndex]) {
            lowestIndex = i;
        }
    }

    return lowestIndex;
}

/**
 * Function that does the main work, called from the autoRandomSectionEnrollment function
 * 
 * Rewrite August 1 2019: Use main course student list for full roster: https://canvas.instructure.com/doc/api/courses.html#method.courses.users.
 * Use section student enrollments to filter out those that have already been placed before doing the action.
 * This saves us from having to know the IDs of the default section(s), which is helpful in the case of cross-listed courses (with multiple 'default' sections)
 * When handling the 'drop' scenario, find those students that only have one enrollment in the course. 
 * If it is one of our experimental sections, it means they are no longer in the main section(s) and can be dropped from the Experimental. 
 * 
 * @param {string} canvasCourseId Canvas Course ID
 * @param {array} sectionNames Array of strings representing the experimental section names to be created and have enrollments distributed to
 * 
 * @returns {string} Text describing the result of the process, including any errors.
 */
async function main(canvasCourseId, sectionNames) {

    let course = null,
        allStudentsInCourse = [],
        experimentalSections = [],
        experimentalSectionEnrollmentTotals = [], //Use these values rather than the result of section.total_students so we can keep track of our enrollment totals as this script runs.
	    courseSections = [],
        studentsToBeRandomlyPlaced = [],
        experimentalEnrollmentsToBeRemoved = [];

    const courseId = canvasCourseId,
          experimentalSectionNames = sectionNames;


    try {
        //Get the course. Not technically required, but helpful for debugging output (course name, etc.)
        let courseResponse = await canvasRequest('courses/'+ courseId);
        course = courseResponse;

        //Get all students in the course
        let allStudentsResponse = await canvasRequest('courses/'+ courseId + '/users', [{'key':'enrollment_type[]','value':'student'},{'key':'include[]','value':'enrollments'}]);
        allStudentsInCourse = allStudentsResponse;

        //Get all sections for the course, including students in each section
        let allSectionsResponse = await canvasRequest('courses/'+ courseId + '/sections', [{'key':'include[]','value':'total_students'}, {'key':'include[]','value':'students'}]);
        courseSections = allSectionsResponse;

        console.log(`=====> Begin function result output for the course: ${course.name} (${course.id})`);
    } catch (error) {
        //Cannot proceed. Log error and return out of the function.
        console.error(new Error(`Error while retrieving initial course/student/section data: ${error.message}`));
        return(`Error while retrieving student/section data: ${error.message}`);
    }



    //Check to see if desired experimental sections already exist, create them if not
    //https://stackoverflow.com/questions/8217419/how-to-determine-if-javascript-array-contains-an-object-with-an-attribute-that-e
    for(let i = 0; i < experimentalSectionNames.length; i++) {
        console.log(`Checking for section '${experimentalSectionNames[i]}'...`);
        
        let foundExistingExperimentalSection = courseSections.filter( section => section['name'] === experimentalSectionNames[i] );
        
        if(foundExistingExperimentalSection.length) {
            console.log(`Already exists. `);
            experimentalSections.push(foundExistingExperimentalSection[0]);
            experimentalSectionEnrollmentTotals[i] = foundExistingExperimentalSection[0].total_students;
        } else {
            console.log(`NOT FOUND. `);
            
            //Create the experimental sections:
            let newSection = await createSectionInCourse(experimentalSectionNames[i], courseId);
            
            if(newSection) {
                experimentalSections.push(newSection);
                experimentalSectionEnrollmentTotals[i] = 0;

                console.log(`Created new section '${experimentalSectionNames[i]}' in course id ${courseId}`);
            } else {
                console.error(new Error(`SECTION CREATE FAILED FOR '${experimentalSectionNames[i]}' IN ${courseId}.`));
            }
        }
    }

    /*
    - Find all students in the course who are not already in one of the experimental sections
      Put in separate array (will be all students on first run)
    */
    studentsToBeRandomlyPlaced = allStudentsInCourse.filter( (student) => { 
        let studentNotYetPlaced = true;

        for(let i = 0; i < experimentalSections.length; i++) {
            if(Array.isArray(experimentalSections[i].students) && experimentalSections[i].students.findIndex(s => s.id === student.id) >= 0) {
                studentNotYetPlaced = false;
            }
        }
        return studentNotYetPlaced; 
    })
    

    //If there are students to be placed. Shuffle them and do the enrollment
    if(studentsToBeRandomlyPlaced.length > 0) {
        studentsToBeRandomlyPlaced = shuffle(studentsToBeRandomlyPlaced);

        for(let i = 0; i < studentsToBeRandomlyPlaced.length; i++) {
            //If sections do not have even enrollment, fill the sections in such a way that they are evenly filled first. 
            //Then proceed with sequential enrollment.
            //indexOfSmallestArrayElement() will return -1 if they are all the same, 
            //or an integer >= 0 for the first index of the section with the lowest enrollment
            let experimentalSectionArrayIndex = indexOfSmallestArrayElement(experimentalSectionEnrollmentTotals);

            if(experimentalSectionArrayIndex < 0) {
                if(i < experimentalSections.length) {
                    experimentalSectionArrayIndex = i;
                } else {
                    experimentalSectionArrayIndex = i % experimentalSections.length;
                }
            }

            let newEnrollment = await enrollStudentInSection(studentsToBeRandomlyPlaced[i].id, experimentalSections[experimentalSectionArrayIndex].id);
            if(newEnrollment) {
                experimentalSectionEnrollmentTotals[experimentalSectionArrayIndex]++;
                console.log(`Enrolled ${studentsToBeRandomlyPlaced[i].id} in ${experimentalSections[experimentalSectionArrayIndex].id}`);
            } else {
                console.error(new Error("ENROLLMENT FAILED FOR ${studentsToBeRandomlyPlaced[i].id} IN ${experimentalSections[experimentalSectionArrayIndex].id}."));
            }
            
        }

    } else {
        //No students found in course that are not yet placed in one of the experimental sections
        console.log(`No students found in the course (${courseId }) that need placement in experimental sections. `);
    }



    //Handle students who have dropped the course.
    //If a student is found to only have one enrollment, and that enrollment is one of the experimental sections,
    //the student has dropped the course. The experimental section enrollment should be dropped.

    for(let i = 0; i < allStudentsInCourse.length; i++) {
        let thisStudentsEnrollments = allStudentsInCourse[i].enrollments;

        //If this student only has one enrollment, and its section ID is one of the experimental sections, the enrollment should be removed. 
        if(thisStudentsEnrollments.length === 1 && experimentalSections.findIndex(s => s.id === thisStudentsEnrollments[0].course_section_id) >= 0) { 
            experimentalEnrollmentsToBeRemoved.push(thisStudentsEnrollments[0]);
        }
    }

    if(experimentalEnrollmentsToBeRemoved.length) {
        for(let i = 0; i < experimentalEnrollmentsToBeRemoved.length; i++) {
            deleteEnrollmentFromCourse(courseId, experimentalEnrollmentsToBeRemoved[i].id);
            console.log(`Removed student ${experimentalEnrollmentsToBeRemoved[i].user_id} from experimental section ${experimentalEnrollmentsToBeRemoved[i].course_section_id}`); 
        }
    } else {
        console.log(`No students found with only experimental section enrollments (dropped course). `);
    }

    return (`Main function complete for course: ${course.name} (${course.id})`);

};





/**
 * MAIN FUNCTION - PubSub
 *
 * @param {object} pubSubEvent The event payload.
 * @param {object} context The event metadata.
 */
exports.autoRandomSectionEnrollmentPubsub = async (pubSubEvent, context) => {

    //Ensure we have the data we need, either from a local config file, or passed to the function at runtime
    //Note, pubsub message is a JSON string that is Base64 encoded. Decode, and parse JSON.
    const messageDataAsJson = JSON.parse(Buffer.from(pubSubEvent.data, 'base64').toString());
    const data = messageDataAsJson.data;
    if(!Array.isArray(data)) {
        console.error(new Error(`No data available to run the function.`));
        return;
    }
    
    //Call the primary function for each course in the data array
    for(let i = 0; i < data.length; i++) {
        if(data[i].courseid && data[i].sectionnames) {
            let result = await main(data[i].courseid, data[i].sectionnames);
            console.log(result);
        } else {
            console.error(new Error(`Missing course ID or experimental section names for data index ${i}.`));
        }
    }

    console.log(`Function autoRandomSectionEnrollmentPubsub execution complete.`);
};


// /**
//  * MAIN FUNCTION - HTTP
//  *
//  * @param {!express:Request} req HTTP request context.
//  * @param {!express:Response} res HTTP response context.
//  */
// exports.autoRandomSectionEnrollment = async (req, res) => {
//      ...code here...
//      res.send(functionResultText.join('\n\n'));
// };