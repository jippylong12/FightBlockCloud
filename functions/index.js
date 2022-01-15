const functions = require("firebase-functions");
const fdClientModule = require('fantasydata-node-client');
const admin = require('firebase-admin');
import dateFormat, { masks } from "dateformat";

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

exports.updateScores = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    function correctChosenFighter(pick) {
        return pick['fighterIdChosen'] === pick['fightData']['WinnerId'];
    }

    function correctChosenMethod(pick) {
        return pick['methodChosen'] === pick['fightData']['ResultType'];
    }

    function correctChosenRound(pick) {
        return pick['roundChosen'] === pick['fightData']['ResultRound'];
    }

    function scorePick(pick){
        let pickedWinner = false;

        // only if the contest is done
        if(pick['fightData']['Status'] === 'Final'){
            pick['score'] = 0; // reset
            pick['perfectHit'] = false;
            // winner correct?
            if (correctChosenFighter(pick)) {
                pickedWinner = true;
                pick['score'] += 2;
                // method correct?
                if (correctChosenMethod(pick)) {
                    if (pick['methodChosen'] === 'DEC') {
                        pick['score'] += 10;
                    } else {
                        // round correct?
                        if (correctChosenRound(pick)) {
                            pick['score'] += 10; // for method and round
                            pick['perfectHit'] = true; // set true
                            pick['score'] *= 3; // Perfect Hit multiplier
                        } else {
                            // just the points for the correct method
                            pick['score'] += 4;
                        }
                    }
                } else if(correctChosenRound(pick)){
                    pick['score'] += 6;
                }
            } else {
                // we do nothing since they didn't make the right pick
            }

            if (pick['FotNBool']) {
                // double score of the bout
                pick['score'] *= 2;
            }
        }

        return pickedWinner;
    }

    // loop through the pickList and score it
    function scorePickList(pickList) {
        pickList['score'] = 0;
        let boutWinnerCount = 0;
        for (let thisPick in pickList['picks']) {
            if(scorePick(thisPick)){
                boutWinnerCount += 1;
            }

            pickList['score'] += thisPick['score'];
        }

        // if we pick all winners then we give the Parlay bonus
        if (boutWinnerCount === pickList['picks'].length) {
            for (let thisPick in pickList['picks']) {
                thisPick['score'] += 6;
                pickList['score'] += thisPick['score'];
            }
        }

    }


    let startDate = new Date();
    let endDate = new Date();
    endDate.setDate(endDate.getDate()+2);
    startDate.setDate(startDate.getDate()-2);
    let isoStringStart = dateFormat(endDate, "isoDateTime");
    let isoStringEnd = dateFormat(endDate, "isoDateTime");

    const FantasyDataClient = new fdClientModule(keys);
    let writeResult = {id: 0}
    let snapshot = await admin.firestore().collection("events")
        .where("DateTime",">", isoStringStart)
        .where("DateTime","<", isoStringEnd)
        .orderBy("DateTime", "desc").get().then(querySnapshot => {
            return querySnapshot.docs.map(doc => doc.data())
        });



    // which leagues to update.
    // {leagueId: {userId: points}}
    let leagueUpdateMap = {}

    snapshot.forEach(event => {
        FantasyDataClient.MMAv3ScoresClient.getEventPromise(event['EventId']).then(async results => {
            results = JSON.parse(results);

            // find all pickLists with this event
            await admin.firestore().collection("pickLists")
                .where("EventId","==", event['EventId']).then(pickListsSnapshot => {
                    pickListsSnapshot.docs.forEach(doc => {
                        let pickList = doc.data();

                        // replace the fight data with the right data
                        pickList['picks'].forEach(pick => {
                            results['Fights'].forEach((fight) => {
                                if(pick['FightData']['FightId'] === fight['FightId']){
                                    pick['FightData'] = fight;
                                }
                            });
                        });

                        // score the pickList
                        scorePickList(pickList);

                        // update
                        admin.firestore().collection("pickLists").doc(doc.id).set(pickList);

                        leagueUpdateMap[pickList['leagueId']][pickList['userId']] = pickList['score'];


                    })

                });



            // update the league leaderboard
            for( let leagueId in leagueUpdateMap){
                admin.firestore().collection("leagues").doc(leagueId).get().then(docSnapshot => {
                    let leagueData = docSnapshot.data();

                    leagueData['leaderboard'].forEach((userRow) => {
                        // if we have this user updated pickList then we replace it
                        if(leagueUpdateMap[leagueId].hasOwnProperty(userRow['userId'])){
                            userRow['score'] = leagueUpdateMap[leagueId][userRow['userId']];
                        }
                    })

                    // update
                    admin.firestore().collection("leagues").doc(leagueId).set(leagueData);
                });
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
