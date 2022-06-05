/**
 * 2022/06/05
 * The API contained "Road to UFC" events which were not actually fights. We need to remove the event from eventDetails
 */
const admin = require("firebase-admin");
const SharedFunctions = require("../../SharedFunctions");
const sharedFunctions = new SharedFunctions();

module.exports = async (request, response) => {


    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

    await removeFromEventDetails(counter,commitCounter, batches);

    await sharedFunctions.writeToDb(batches);
    response.send(`Processed`);




    // Remove from Event Details
    async function removeFromEventDetails(counter, commitCounter, batches) {

        let eventDetails = await admin.firestore().collection("eventDetails").get().then(querySnapshot => {
            return querySnapshot.docs.map(doc => doc)
        });

        eventDetails.forEach(function (event) {
            {
                let eventDetailsData = event.data();

                if (eventDetailsData['ShortName'] === 'Road to UFC') {
                    if (counter <= 498) {
                        counter = counter + 1;
                    } else {
                        counter = 0;
                        commitCounter = commitCounter + 1;
                        batches[commitCounter] = admin.firestore().batch();
                    }
                    batches[commitCounter].delete(admin.firestore().collection("eventDetails").doc(event.id))
                }
            }
        });
    }

}
