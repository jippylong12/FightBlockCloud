const functions = require("firebase-functions");
const fdClientModule = require('fantasydata-node-client');
const admin = require('firebase-admin');

admin.initializeApp();

const keys = {
    'MMAv3StatsClient': 'f1914d5079c141b9bf2fd101292e8f3c',
    'MMAv3ScoresClient': 'f1914d5079c141b9bf2fd101292e8f3c'
};


exports.getMMASchedule = functions.pubsub.schedule('every 1 hour').onRun((context) => {
    console.log('This will be run every 5 minutes!');
    return null;
});


// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
exports.helloWorld = functions.https.onRequest(async (request, response) => {

    const FantasyDataClient = new fdClientModule(keys);
    let writeResult = {id: 0}
    let snapshot = await admin.firestore().collection("events").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });

    await FantasyDataClient.MMAv3ScoresClient.getSchedulePromise("UFC", 2021).then(async results => {
      results = JSON.parse(results);

      results.forEach(event => {

          if(!snapshot.some(item => item.EventId === event['EventId'])){
              functions.logger.info(`Adding event ${JSON.stringify(event)}`, {structuredData: true});
              writeResult = admin.firestore().collection('events').add(event);
          }
      })

    }).catch(error => {
      functions.logger.error("Client failed!", {structuredData: true});
      functions.logger.error(error, {structuredData: true});
    })

    response.send(`Processing`);
});
