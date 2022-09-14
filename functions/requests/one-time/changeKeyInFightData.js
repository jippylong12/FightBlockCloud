/**
 * 2022/09/15
 * When I first transformed the data I forgot to add the FightId which is important. So all the picks won't score and the
 * getMMAEventDetails continues to not work correctly
 */
const admin = require("firebase-admin");
const SharedFunctions = require("../../SharedFunctions");
const sharedFunctions = new SharedFunctions();

module.exports = async (request, response) => {

    let pickLists = await admin.firestore().collection("pickLists")
        .where('createdAt','>', '2022-08-01T00:00:00').get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc)
    });

    pickLists.forEach(function(pickList){{
        let pickListData = pickList.data();
        let updated = false;
        pickListData['picks'].forEach((pick) => {
            if (pick['fightData'].hasOwnProperty('id')) {
                pick['fightData']['FightId'] = pick['fightData']['id'];
                delete pick['fightData']['id'];
                updated = true;
            }
        })

        if(updated) {
            admin.firestore().collection('pickLists').doc(pickList.id).set(pickListData);
        }
    }});

    let eventDetails = await admin.firestore().collection("apis/v2/eventDetails")
        .where('DateTime','>', '2022-08-01T00:00:00').get().then(querySnapshot => {
            return querySnapshot.docs.map(doc => doc)
        });

    eventDetails.forEach(function(event){{
        let eventsData = event.data();
        let updated = false;
        eventsData['Fights'].forEach((fight) => {
            if (fight.hasOwnProperty('id')) {
                fight['FightId'] = fight['id'];
                delete fight['id'];
                updated = true;
            }
        })

        if(updated) {
            admin.firestore().collection('apis/v2/eventDetails').doc(event.id).set(eventsData);
        }
    }});

    response.send(`Processed`);
}
