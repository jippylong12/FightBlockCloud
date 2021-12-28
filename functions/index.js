const functions = require("firebase-functions");
const fdClientModule = require('fantasydata-node-client');
const admin = require('firebase-admin');

admin.initializeApp();

const keys = {
    'MMAv3StatsClient': 'f1914d5079c141b9bf2fd101292e8f3c',
    'MMAv3ScoresClient': 'f1914d5079c141b9bf2fd101292e8f3c'
};


exports.getMMASchedule = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const FantasyDataClient = new fdClientModule(keys);
    let writeResult = {id: 0}
    let snapshot = await admin.firestore().collection("events").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });

    await FantasyDataClient.MMAv3ScoresClient.getSchedulePromise("UFC", 2021).then(async results => {
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
});

exports.getMMAFighters = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    function oneSecond() {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve('resolved');
            }, 1010);
        });
    }

    async function writeToDb(arr) {
        console.log("beginning write");
        for (var i = 0; i < arr.length; i++) {
            await oneSecond();
            arr[i].commit().then(function () {
                console.log("wrote batch " + i);
            });
        }
        console.log("done.");
    }


    const FantasyDataClient = new fdClientModule(keys);
    let snapshot = await admin.firestore().collection("fighters").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });



    await FantasyDataClient.MMAv3ScoresClient.getFightersPromise().then(async results => {
        var counter = 0;
        var commitCounter = 0;
        var batches = [];

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

        await writeToDb(batches);

    }).catch(error => {
        functions.logger.error("Client failed!", {structuredData: true});
        functions.logger.error(error, {structuredData: true});
    })

    return null;
});

exports.getMMAEventDetails = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {

    const FantasyDataClient = new fdClientModule(keys);
    let writeResult = {id: 0}
    let snapshot = await admin.firestore().collection("events").orderBy("DateTime", "desc").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });

    let eventDetailSnapshot = await admin.firestore().collection("eventDetails").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });


    snapshot.forEach(event => {
        FantasyDataClient.MMAv3ScoresClient.getEventPromise(event['EventId']).then(async results => {
            results = JSON.parse(results);
            if (eventDetailSnapshot.length === 0 || !eventDetailSnapshot.some(item => item.EventId === results['EventId'])) {
                functions.logger.info(`Adding eventDetails ${JSON.stringify(results)}`, {structuredData: true});
                writeResult = admin.firestore().collection('eventDetails').add(results);
            }
        }).catch(error => {
            functions.logger.error("Client failed!", {structuredData: true});
            functions.logger.error(error, {structuredData: true});
        })
    });

    return null;
});

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
exports.helloWorld = functions.https.onRequest(async (request, response) => {

    response.send(`Processing`);
});
