/**
 * 2022/11/04
 * Somehow we have multiple events from the same event
 */
const admin = require("firebase-admin");

module.exports = async (request, response) => {
    let eventDetailSnapshot = await admin.firestore().collection("apis/v2/eventDetails")
        .orderBy("DateTime", "desc").get();

    let seenEventIds = new Set();


    eventDetailSnapshot.forEach(function(event){{
        let data = event.data();

        if (data['Fights'].length === 0) {
            admin.firestore().collection('apis/v2/eventDetails').doc(event.id).delete();
        } else if(seenEventIds.has(data['EventId'])) {
            admin.firestore().collection('apis/v2/eventDetails').doc(event.id).delete();
        } else {
            seenEventIds.add(data['EventId']);
        }
    }});

    response.send(`Completed.`);
}
