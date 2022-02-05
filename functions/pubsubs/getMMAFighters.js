const fdClientModule = require("fantasydata-node-client");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const Constants = require("./Constants");
const SharedFunctions = require("../SharedFunctions");
const sharedFunctions = new SharedFunctions();

module.exports = async (context) => {

    const FantasyDataClient = new fdClientModule(Constants.keys);
    let snapshot = await admin.firestore().collection("fighters").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });



    await FantasyDataClient.MMAv3ScoresClient.getFightersPromise().then(async results => {
        let counter = 0;
        let commitCounter = 0;
        let batches = [];

        batches[commitCounter] = admin.firestore().batch();

        results = JSON.parse(results);

        console.log(results.length);

        results.forEach(fighter => {
            if (snapshot.length === 0 || !snapshot.some(item => item.FighterId === fighter['FighterId'])) {
                if(counter <= 498){
                    batches[commitCounter].set(admin.firestore().collection('fighters').doc(), fighter)
                    counter = counter + 1;
                } else {
                    counter = 0;
                    commitCounter = commitCounter + 1;
                    batches[commitCounter] = admin.firestore().batch();
                }
            }
        })

        await sharedFunctions.writeToDb(batches);

    }).catch(error => {
        functions.logger.error("Client failed!", {structuredData: true});
        functions.logger.error(error, {structuredData: true});
    })

    return null;
}
