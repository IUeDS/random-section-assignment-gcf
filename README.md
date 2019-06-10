
## Canvas Random Section Assignment - Google Cloud Function
This Google Cloud Function will randomly place students enrolled in the default course section into ad hoc sections as specified in the request. This function is a proof of concept that can be extended to suit various deployment schemes and scenarios.

About Google Cloud Functions: [https://cloud.google.com/functions/](https://cloud.google.com/functions/)

### General logic:
- Get default section data, including its student enrollments*
- Get all sections for the course*
- Check to see if desired ad hoc sections already exist (compare names)
	- If not, create them*
	- If so, get their IDs
- Find all students in default section who are not already in one of the ad hoc sections
	- Put in separate array (will be all students on first run)
	- Shuffle array
	- Enroll students in the ad hoc sections based on dividing the shuffled array by the number of new sections.*
- TODO: Find all students who are in one of the ad hoc sections but NOT in the default section (they have dropped the class)
	- Remove student enrollment from ad hoc section

[*] requires api call

**Note: We're using the default section ID as the main piece of identifying data.**
If we used the course ID, we'd have no way of *really* knowing which section was the default section after others are created. But given the default section ID, we can get the course ID for other API calls.

### Google Cloud Resources
Google Cloud Function Emulator for local development:
https://rominirani.com/google-cloud-functions-tutorial-setting-up-a-local-development-environment-8acd394a8b76
https://github.com/GoogleCloudPlatform/cloud-functions-emulator
https://cloud.google.com/functions/docs/emulator
  
Google SDK:
https://cloud.google.com/sdk/gcloud/reference/

Helpful gcloud commands
 - To check current project/configuration: `gcloud config list`
 - To list all projects: `gcloud projects list`
 - To change project: `gcloud config set project <projectname>`

NOTE: Need to export env variables before starting the emulator in order for them to be accessible.
https://github.com/GoogleCloudPlatform/cloud-functions-emulator/issues/178#issuecomment-420916511

```
functions stop
export API_ROOT=https://<domain>.instructure.com/api/v1/
export API_TOKEN=<token>
functions start
```
Helpful emulator commands
- Start emulator: `functions start`
- To deploy to emulator: `functions deploy autoRandomSectionEnrollment --trigger-http`
- To run on emulator: `functions call autoRandomSectionEnrollment --data='{"sectionid":"2006214", "sectionnames":["Condition 1","Condition 2"]}'`
- View logs: `functions logs read`

For production deployment, use the gcloud cli. Similar to above, but must specify runtime and env values:
`gcloud functions deploy autoRandomSectionEnrollment --runtime nodejs8 --memory=128MB --set-env-vars API_ROOT=https://<domain>.instructure.com/api/v1/,API_TOKEN=<token> --trigger-http`

Example request body:
```
{
	"sectionid":"2006214",
	"sectionnames": [
		"Condition 1",
		"Condition 2"
	]
}
```

So far, we have run this function by using direct calls as described here: [https://cloud.google.com/functions/docs/calling/direct](https://cloud.google.com/functions/docs/calling/direct).

Some TODOs:

 - Drop students from ad hoc sections if they no longer appear in the default section (i.e., they have dropped the class).
 - At the moment, the function exposes a URL that is not locked down in any strict way. Any HTTP POST that contains the proper JSON request structure would trigger the process. Need to look into how to tighten that down. 
 - Learn a little more about how/when this process would be run, including scalability. Currently set up to be triggered via HTTP POST, but Pub/Sub is also and option to explore. 
 - The API token is stored as an environment variable in the Cloud Function Console. There are more robust ways to encrypt the token and retrieve it using APIs in the code, but haven't gotten there yet.
