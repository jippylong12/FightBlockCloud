const fdClientModule = require("fantasydata-node-client");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const Constants = require("./Constants");

module.exports = async (context) => {
    const FantasyDataClient = new fdClientModule(Constants.keys);
    let writeResult = {id: 0}
    let snapshot = await admin.firestore().collection("events").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });

    await FantasyDataClient.MMAv3ScoresClient.getSchedulePromise("UFC", 2022).then(async results => {
        results = JSON.parse(results);

        results.forEach(event => {

            if (!snapshot.some(item => item.EventId === event['EventId'])) {
                functions.logger.info(`Adding event ${JSON.stringify(event)}`, {structuredData: true});
                writeResult = admin.firestore().collection('events').add(event);
            }
        })

    }).catch(error => {
        functions.logger.error("Client failed!", {structuredData: true});
        functions.logger.error(error, {structuredData: true});
    })
    return null;
}
