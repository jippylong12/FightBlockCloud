/**
 * 2022/04/10
 * Temp fix because the fight data has null instead of empty string or another string
 */
const admin = require("firebase-admin");
const SharedFunctions = require("../../SharedFunctions");
const sharedFunctions = new SharedFunctions();

module.exports = async (request, response) => {

    // create userID map
    let userMap = {};
    let pickLists = await admin.firestore().collection("pickLists").where("eventId","==",235) .get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc)
    });

    // go through leaderboard and check if their is value and replace
    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

    for (const pickList of pickLists ) {
        let pickListData = pickList.data();
        pickListData['picks'].forEach(function(pick) {
           if( pick['fightData']['ResultType'] === null) {
               pick['fightData']['ResultType'] = "";
           }
        });

        if(counter <= 498){
            batches[commitCounter].set(admin.firestore().collection('pickLists').doc(pickList.id), pickListData)
            counter = counter + 1;
        } else {
            counter = 0;
            commitCounter = commitCounter + 1;
            batches[commitCounter] = admin.firestore().batch();
            batches[commitCounter].set(admin.firestore().collection('pickLists').doc(pickList.id), pickListData)
        }
    }

    // update leagues
    await sharedFunctions.writeToDb(batches);
    response.send(`Processed`);

}
