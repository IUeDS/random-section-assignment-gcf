const axios = require('axios');

//Environment Params
const apiBaseUrl = process.env.API_ROOT,
      apiToken = process.env.API_TOKEN;

//Setup the Axios client
const apiClient = axios.create({
    baseURL: apiBaseUrl,
    timeout: 5000,
    headers: {'Authorization': 'Bearer ' + apiToken}
});


//Helper functions

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
        let newSection = await apiClient.post('/courses/' + courseId + '/sections?course_section[name]=' + sectionName);
        return newSection.data;
    } catch (error) {
        console.log("====> Error creating section '" + sectionName + "' in course " + courseId + ", API returned: " + error.message);
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
        let response = await apiClient.post('/sections/' + sectionId + '/enrollments?enrollment[type]=StudentEnrollment&enrollment[user_id]=' + userId);
        return response.data;
    } catch(error) {
        console.log("====> Error enrolling user '" + userId + "' in section " + sectionId + ", API returned: " + error.message);
        return false;
    }
}


/**
 * Concludes an enrollment in a course ID by enrollment ID 
 * TODO: Conclude or delete the enrollment?
 * 
 * @param {int} courseId Canvas course ID
 * @param {int} enrollmentId Canvas enrollment ID
 * 
 * @returns deleted enrollment JSON on success, false on failure
 */
async function unenrollStudentFromSection(courseId, enrollmentId) {
    try {
        let response = await apiClient.delete('/courses/' + courseId + '/enrollments/' + enrollmentId);
        return response.data;
    } catch(error) {
        console.log("====> Error enrolling user '" + userId + "' in section " + sectionId + ", API returned: " + error.message);
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
 * MAIN FUNCTION
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
exports.autoRandomSectionEnrollment = async (req, res) => {

    let output = 'Begin output: \n',
        courseId = 0,
        defaultSection = {},
        adHocSections = [],
        adHocSectionEnrollmentTotals = [], //Use these values rather than the result of section.total_students so we can keep track of our enrollment totals as this script runs.
	    courseSections = [],
        studentsToBeRandomlyPlaced = [],
        adHocEnrollmentsToBeRemoved = [];

    //Expects default section ID and ad hoc section name array in request body:
    //TODO: Validate input
    let defaultSectionId = req.body.sectionid, // my test course's default section: 1606526, ben's test course default section: 2006214 
        adHocSectionNames = req.body.sectionnames;


    try {

        //Get default section data (NOTE: students don't come back from this endpoint with ?include[]=students. Don't know why.)
        let defaultSectionResponse = await apiClient.get('/sections/' + defaultSectionId);
        courseId = defaultSectionResponse.data.course_id;

        //Get all sections for the course, including students in each section
        let allSectionsResponse = await apiClient.get('/courses/'+ courseId + '/sections?include[]=total_students&include[]=students');
        courseSections = allSectionsResponse.data;

        //Find the default section within the full list of sections, so we'll have the student enrollments without needing to make an additional API call.
        defaultSection = courseSections[courseSections.findIndex(section => section.id === parseInt(defaultSectionId))];
    } catch (error) {
        res.send("Error while retrieving section data: " + error.message);
        return;
    }



    //Check to see if desired ad hoc sections already exist, create them if not
    //https://stackoverflow.com/questions/8217419/how-to-determine-if-javascript-array-contains-an-object-with-an-attribute-that-e
    for(let i = 0; i < adHocSectionNames.length; i++) {
        output += "Checking for section " + adHocSectionNames[i] + ". \n";
        
        let foundExistingAdHocSection = courseSections.filter( section => section['name'] === adHocSectionNames[i] );
        
        if(foundExistingAdHocSection.length) {
            output += "Section " + foundExistingAdHocSection[0].name + " was found. \n";
            adHocSections.push(foundExistingAdHocSection[0]);
            adHocSectionEnrollmentTotals[i] = foundExistingAdHocSection[0].total_students;
        } else {
            output += "Section " + adHocSectionNames[i] + " was NOT found. \n";
            
            //Create the ad hoc sections:
            let newSection = await createSectionInCourse(adHocSectionNames[i], courseId);
            
            if(newSection) {
                adHocSections.push(newSection);
                adHocSectionEnrollmentTotals[i] = 0;

                output += "Created new section " + adHocSectionNames[i] + " in course id " + courseId + "\n";
            } else {
                output += "SECTION CREATE FAILED FOR " + adHocSectionNames[i] + " IN " + courseId + ". CHECK THE LOGS. \n";
            }
        }
    }

    /*
    - Find all students in default section who are not already in one of the ad hoc sections
      Put in separate array (will be all students on first run)
    */
    studentsToBeRandomlyPlaced = defaultSection.students.filter( (student) => { 
        let studentNotYetPlaced = true;

        for(let i = 0; i < adHocSections.length; i++) {
            if(Array.isArray(adHocSections[i].students) && adHocSections[i].students.findIndex(s => s.id === student.id) >= 0) {
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
            let adHocSectionArrayIndex = indexOfSmallestArrayElement(adHocSectionEnrollmentTotals);
            if(adHocSectionArrayIndex < 0) {
                if(i < adHocSections.length) {
                    adHocSectionArrayIndex = i;
                } else {
                    adHocSectionArrayIndex = i % adHocSections.length;
                }
            }

            let newEnrollment = await enrollStudentInSection(studentsToBeRandomlyPlaced[i].id, adHocSections[adHocSectionArrayIndex].id);
            if(newEnrollment) {
                adHocSectionEnrollmentTotals[adHocSectionArrayIndex]++;
                output += "Enrolled " + studentsToBeRandomlyPlaced[i].id + " in " + adHocSections[adHocSectionArrayIndex].id + "\n";
            } else {
                //TODO: Why does this code run when the enrollment does in fact succeed?
                output += "ENROLLMENT FAILED FOR " + studentsToBeRandomlyPlaced[i].id + " IN " + adHocSections[adHocSectionArrayIndex].id + ". CHECK THE LOGS. \n";
            }
            
        }

    } else {
        //No students found in default section that are not yet placed in one of the ad hoc sections
        output += "No students found in default section (" + defaultSectionId  + ") that need placement in ad hoc sections. \n";
    }

            // //TODO: On the flip side, if there are students in one of the ad-hoc sections that no longer appear in the default section,
            // //they have dropped and they need to be removed from the ad hoc section so the course no longer appears in their list in Canvas.
            // //Avoids confusion.

            // //Build array of enrollments to remove from all ad hoc sections:
            // for(let i = 0; i < adHocSections.length; i++) {
            //     let enrollmentsToRemove = adHocSections[i].students.filter((student) => {
            //         console.log("====> " + defaultSection.students.findIndex(s => s.id === student.id) + " \n");
            //         if(defaultSection.students.findIndex(s => s.id === student.id) < 0) { 
            //             return true;
            //         } else {
            //             return false;
            //         }
            //     });

            //     adHocEnrollmentsToBeRemoved = adHocEnrollmentsToBeRemoved.concat(enrollmentsToRemove);
            // }

            // output += "Removing students: " + JSON.stringify(adHocEnrollmentsToBeRemoved) + " \n";


    // output += JSON.stringify(defaultSection, null, '\t');
    // output += JSON.stringify(adHocSections, null, '\t');

    res.send(output);

};