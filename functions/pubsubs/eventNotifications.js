const admin = require("firebase-admin");
const SharedFunctions = require("../SharedFunctions");
const luxon = require("luxon");
const sharedFunctions = new SharedFunctions();

module.exports = async (context) => {
    let leagueSnapshot = await admin.firestore().collection("leagues")
        .where('completeAt', '==', null)
        .get().then(querySnapshot => {
            return querySnapshot.docs.map(function(doc) { return doc;})
        });

    let counter = 0;
    let commitCounter = 0;
    let batches = [];

    batches[commitCounter] = admin.firestore().batch();

    for (const leagueDoc of leagueSnapshot) {
        const leagueData = leagueDoc.data();
        const nextEventIndex = leagueData['events'].findIndex(item => item["Status"] !== "Final");

        // get the next event in this league
        if(nextEventIndex !== -1){
            const topic = 'league-' + leagueDoc.id;
            const nextEvent = leagueData['events'][nextEventIndex];
            const nextEventId = nextEvent['EventId'];
            const now = luxon.DateTime.now();
            const eventDateTime = luxon.DateTime.fromISO(nextEvent['DateTime'], { zone: "America/New_York" });

            // add the new object if we don't have it for some reason
            if(leagueData['notifications'] === undefined){
                leagueData['notifications'] = {};
                leagueData['notifications'][nextEventId] = {
                    'twoDays': false,
                    'twelveHours': false,
                };
            }

            if (leagueData['notifications'][nextEventId] === undefined){
                leagueData['notifications'][nextEventId] = {
                    'twoDays': false,
                    'twelveHours': false,
                };
            }

            // check if we are within the 48 or 12 hours
            // true if we have already sent
            const twoDayBool = leagueData['notifications'][nextEventId]['twoDays'] === true
            const twelveHoursBool = leagueData['notifications'][nextEventId]['twelveHours'] === true

            let sending = false;
            let body = "";
            if(now.plus(luxon.Duration.fromObject({ days: 2})) > eventDateTime && !twoDayBool){
                sending = true;
                body = "Only 2 days left before the picks lock this week!"
                leagueData['notifications'][nextEventId]['twoDays'] = true;
            } else if (now.plus(luxon.Duration.fromObject({ hours: 12})) > eventDateTime && !twelveHoursBool) {
                sending = true;
                body = "Only 12 hours left before the picks lock this week!"
                leagueData['notifications'][nextEventId]['twelveHours'] = true;
            }


            if(sending){
                console.log('Topic', topic);
                // send the message
                const message = {
                    notification: {
                        title: leagueData['name'] + " - Have you set your picks?",
                        body: body
                    },
                    data: {},
                    topic: topic
                };

                // gather to update the league ids by batch
                if(counter <= 498){
                    batches[commitCounter].set(admin.firestore().collection('leagues').doc(leagueDoc.id), leagueData)
                    counter = counter + 1;
                } else {
                    counter = 0;
                    commitCounter = commitCounter + 1;
                    batches[commitCounter] = admin.firestore().batch();
                }

                // Send a message to devices subscribed to the provided topic.
                await admin.messaging().send(message)
                    .then((response) => {
                        console.log('Successfully sent message:', response);
                    })
                    .catch((error) => {
                        console.log('Error sending message:', error);
                    });
            }
        }
    }

    await sharedFunctions.writeToDb(batches);

    return null;
}
