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
        .where('createdAt','>', '"2022-08-01T00:00:00"').get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc)
    });


    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

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

    await sharedFunctions.writeToDb(batches);
    response.send(`Processed`);
}
