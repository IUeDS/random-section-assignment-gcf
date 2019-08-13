
## DRAFT: Canvas Random Section Assignment - Google Cloud Function
This Google Cloud Function will randomly place students enrolled in a course into ad hoc experimental sections as specified in the request. This function is a proof of concept that can be extended to suit various deployment schemes and scenarios.

The function is written in Node.js, triggered via Pub/Sub, and we are using a Cloud Scheduler task to call the function nightly to handle adds/drops. 

About Google Cloud Functions: [https://cloud.google.com/functions/](https://cloud.google.com/functions/)

### General logic:
- Get all students in the course, including their section enrollments for the course*
- Get all sections for the course, including students enrolled in each*
- Check to see if desired ad hoc sections already exist (compare names)
	- If not, create them*
	- If so, get their IDs
- Find all students in the course who are not already in one of the experimental sections
	- Put in separate array (will be all students on first run)
	- Shuffle array
	- Enroll students in the ad hoc sections, maintaining even enrollment totals across sections.*
- TODO: Find all students who *only* have one enrollment, and that is an experimental section (that is, they have dropped the class)
	- Remove student enrollment from ad hoc section*

### Required Canvas API calls
```
GET /api/v1/sections/:section_id/enrollments?user_id=userId
GET /api/v1/courses/:course_id
GET /api/v1/courses/:course_id/users?enrollment_type[]=student&include[]=enrollments
GET /api/v1/courses/:course_id/sections?include[]=total_students&include[]=students
POST /api/v1/courses/:course_id/sections?course_section[name]=sectionName
POST /api/v1/sections/:section_id/enrollments?enrollment[type]=StudentEnrollment&enrollment[user_id]userId
DELETE /api/v1/courses/:course_id/enrollments/:enrollment_id?task=delete

```

Environment variables are used for the Canvas root domain and API token string. Details for local setup and prod deployment below.


## Local dev environment setup and Google Cloud resources
Ensure Node.js 10+ and NPM are installed and available on the local machine.

Install the Google SDK:
https://cloud.google.com/sdk/gcloud/reference/

Helpful gcloud commands
 - To check current project/configuration: `gcloud config list`
 - To list all projects: `gcloud projects list`
 - To change project: `gcloud config set project <projectname>`

NOTE: Need to export env variables before starting the emulator in order for them to be accessible. From the command line:

```
export API_ROOT=https://<domain>.instructure.com/api/v1/
export API_TOKEN=<token>
```

Note: For local testing, the GCF Emulator has been deprecated in favor of the "Functions Framework". 
https://cloud.google.com/functions/docs/functions-framework



### Local testing of cloud events

---
NOTE: The following techniques described here for local testing of pub/sub triggered functions is not working as of 8/10/2019. 
See: https://github.com/GoogleCloudPlatform/functions-framework-nodejs/issues/37
	 https://github.com/GoogleCloudPlatform/functions-framework-nodejs/issues/41
It should work in theory, but the event payload unmarshalling is not working correctly, and the first parameter of the function is coming back undefined.

The workaround is to temporarily rewrite the function to use an HTTP trigger for local testing, then re-wire up the pub-sub signature before deployment. 
This means reconfiguring the output to return an HTTP response, and reconfiguring how the data is passed to the function (instead of the pubsub data attribute)
The only other option at the time of this writing is to deploy the pubsub function after each edit and trigger it by publishing to the topic from the command line:
```
gcloud pubsub topics publish experimentalsectionenrollment --message '{"data": [{"courseid":"1402787","sectionnames": ["Condition 1","Condition 2"]},{"courseid":"1767838","sectionnames": ["Condition 1","Condition 2"]}]}'
```
---

The setup for cloud functions that accept events is very similar to the instructions in the quickstart (https://cloud.google.com/functions/docs/functions-framework), with the following adjustments differences.

In your package.json, add a signature type (in bold) to your start command:
<pre>
  "scripts": {
    "start": "functions-framework --target=helloWorld <b>--signature-type=event"</b>
  }
</pre>

Upon running `npm start`, you'll see the function is still being served at http://localhost:8080/. However it is no longer accessible via GET requests from the browser. Instead, send a POST request where the request body conforms to the API defined by [push subscriptions](https://cloud.google.com/pubsub/docs/push). 

#### Submitting POST request to simulating a pubsub message

Create mock-pubsub.json file with the following contents. Note that the `data` value is Base64 encoded. In our case, this is the JSON payload for the function (see below)
```json
{
  "message": {
    "attributes": {
      "key": "value"
    },
    "data": "SGVsbG8gQ2xvdWQgUHViL1N1YiEgSGVyZSBpcyBteSBtZXNzYWdlIQ==",
    "messageId": "012345678901"
  },
  "subscription": "projects/myproject/subscriptions/experimentalsectionenrollment"
}
```

The file can be in any folder on your computer. From the terminal, goto the directory where ```mockPubsub.json``` is located, and run the following command assuming your cloud function is hosted locally on port 8080:
```
curl -d "@mock-pubsub.json" -X POST -H "Ce-Type: true" -H "Ce-Specversion: true" -H "Ce-Source: true" -H "Ce-Id: true" http://localhost:8080
```

#### Example JSON payload to pass to the function:
```
{
    "data": [
        {
            "courseid":"1402787",
            "sectionnames": [
                "Condition 1",
                "Condition 2"
            ]
        },
        {
            "courseid":"1767838",
            "sectionnames": [
                "Condition 1",
                "Condition 2"
            ]
        },
		...

    ]
}
```


#### For production deployment, use the gcloud cli.
```
gcloud functions deploy autoRandomSectionEnrollmentPubsub 
	--set-env-vars API_ROOT=https://<domain>.instructure.com/api/v1/,API_TOKEN=<token> 
	--runtime nodejs10 
	--timeout 540s 
	--trigger-topic experimentalsectionenrollment
```

### Setting up the Cloud Scheduler
After deploying the function, is is simple to setup a Cloud Scheduler task to handle running the function on a schedule using a CRON-style definition syntax. When creating a new task at https://console.cloud.google.com/cloudscheduler, the fields are all pretty self explanatory. Make sure that the Pub/Sub topic specified matches the one used when deploying the function. The Payload will contain the full JSON string as described above. The task can be triggered ad hoc for the initial run of the function.

### Some points about scale and resources
In initial testing, we've found that some of the API calls (in particular those that retrieve the course users) can take a very long time to run, even when paging 50 or so at a time (10+ seconds). Not quite sure yet where that comes from, but may be worth noting. Depending on how many courses need to be run, it may be necessary to batch the courses instead of doing them all at once, particularly on the initial run where all students are placed in a random section.


### Some TODOs:
 - The API token is stored as an environment variable in the Cloud Function Console. There are more robust ways to encrypt the token and retrieve it using APIs in the code, but haven't gotten there yet.
 - The function was originally setup so that each course could have its own experimental sections specified. This is a more flexible way to go, but since our use-case has the same section names used in each course, it means a lot of duplication in the JSON payload. Look at rewriting so that one set of section names is used for all courses.
