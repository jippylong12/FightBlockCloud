/**
 * 2022/02/10
 * Add the inviteCode property to the data
 */
const admin = require("firebase-admin");
const SharedFunctions = require("../../SharedFunctions");
const sharedFunctions = new SharedFunctions();
const uuid = require("uuid");

module.exports = async (request, response) => {
    let leagues = await admin.firestore().collection("leagues").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc)
    });


    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

    leagues.forEach(function(league){{
        let data = league.data();

        data['inviteCode'] = uuid.v4().split("-").slice(0,3).join("")

        if(counter <= 498){
            batches[commitCounter].set(admin.firestore().collection('leagues').doc(league.id), data)
            counter = counter + 1;
        } else {
            counter = 0;
            commitCounter = commitCounter + 1;
            batches[commitCounter] = admin.firestore().batch();
            batches[commitCounter].set(admin.firestore().collection('leagues').doc(league.id), data)
        }

    }});

    await sharedFunctions.writeToDb(batches);
    response.send(`Processed`);

}
