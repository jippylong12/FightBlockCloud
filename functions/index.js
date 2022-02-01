const functions = require("firebase-functions");
const fdClientModule = require('fantasydata-node-client');
const admin = require('firebase-admin');

admin.initializeApp();

const keys = {
    'MMAv3StatsClient': 'ff83c11ae8594e0683721e682e36bc98',
    'MMAv3ScoresClient': 'ff83c11ae8594e0683721e682e36bc98'
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
    let snapshot = await admin.firestore().collection("events").where("Status", "==", "Scheduled").orderBy("DateTime", "desc").get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc.data())
    });

    let eventDetailSnapshot = await admin.firestore().collection("eventDetails").where("Status", "==", "Scheduled").get().then(querySnapshot => {
        return querySnapshot.docs.map(function(doc) { return {[doc.data()['EventId']]: [doc.id,doc.data()]}})
    });


    snapshot.forEach(event => {
        FantasyDataClient.MMAv3ScoresClient.getEventPromise(event['EventId']).then(async results => {
            results = JSON.parse(results);
            let eventDetail = eventDetailSnapshot.find(item => item[results['EventId']]);
            if (eventDetail) {
                eventDetail = eventDetail[results['EventId']];
                functions.logger.info(`Updating eventDetails ${JSON.stringify(eventDetail[0])}`, {structuredData: true});
                // if it exists

                // WE NEED TO UPDATE THE EVENT DETAILS FOR FUTURE CARDS AND THEN
                admin.firestore().collection('eventDetails').doc(eventDetail[0]).update(results)


                // GET ALL PICK LISTS WITH SAME ID AND THEN UPDATE THAT DATA AS WELL
                let pickLists = await admin.firestore().collection("pickLists").where("eventId", "==", results['EventId']).get()
                pickLists.forEach(function(list) {
                    let updateId = list.id;
                    let listData = list.data();

                    // for each pick list, let's update the fight data
                    listData['picks'].forEach(function(pick) {
                        let resultData = results['Fights'].find(item => item['Order'] === pick['fightData']['Order']);
                        if(resultData){
                            pick['fightData'] = resultData;
                        }
                    })

                    admin.firestore().collection('pickLists').doc(updateId).update(listData)
                })
            } else{
                functions.logger.info(`Adding eventDetails ${JSON.stringify(results)}`, {structuredData: true});
                // it doesn't exist so add it
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

    let working = true;
    let startDate = new Date();
    let endDate = new Date();
    endDate.setDate(endDate.getDate()+2);
    startDate.setDate(startDate.getDate()-2);
    let isoStringStart = startDate.toISOString();
    let isoStringEnd = endDate.toISOString();

    const FantasyDataClient = new fdClientModule(keys);
    let snapshot = await admin.firestore().collection("events")
        .where("DateTime",">", isoStringStart)
        .where("DateTime","<", isoStringEnd)
        .orderBy("DateTime", "desc").get().then(querySnapshot => {
            return querySnapshot.docs.map(doc => doc.data())
        });

    // which leagues to update.
    // {leagueId: {userId: points}}
    let leagueUpdateMap = {}

    for (const event of snapshot) {
        await FantasyDataClient.MMAv3ScoresClient.getEventPromise(event['EventId']).then(async results => {
            results = JSON.parse(results);

            // find all pickLists with this event
            await admin.firestore().collection("pickLists")
                .where("eventId","==", event['EventId']).get().then(pickListsSnapshot => {

                    pickListsSnapshot.docs.forEach(doc => {
                        let pickList = doc.data();

                        // replace the fight data with the right data
                        pickList['picks'].forEach(pick => {
                            results['Fights'].forEach((fight) => {
                                if(pick['fightData']['FightId'] === fight['FightId']){
                                    pick['fightData'] = fight;
                                }
                            });
                        });

                        // score the pickList
                        scorePickList(pickList);


                        // update
                        admin.firestore().collection("pickLists").doc(doc.id).set(pickList);


                        if(!leagueUpdateMap.hasOwnProperty(pickList['leagueId'])){
                            leagueUpdateMap[pickList['leagueId']] = {};
                        }
                        leagueUpdateMap[pickList['leagueId']][pickList['userId']] = pickList['score'];

                        console.log("League Update Map");
                        console.log(JSON.stringify(leagueUpdateMap));
                    })
                });


            working = false;

            // update the league leaderboard
            for( let leagueId in leagueUpdateMap){
                admin.firestore().collection("leagues").doc(leagueId).get().then(docSnapshot => {
                    let leagueData = docSnapshot.data();

                    leagueData['leaderboard'].forEach((userRow) => {
                        // if we have this user updated pickList then we replace it
                        if(leagueUpdateMap[leagueId].hasOwnProperty(userRow['userId'])){
                            console.log("found user");
                            userRow['score'] = leagueUpdateMap[leagueId][userRow['userId']];
                        }
                    })

                    leagueData['leaderboard'].sort(function(a, b) {
                        var nameA = a.score;
                        var nameB = b.score;
                        if (nameA < nameB) {
                            return -1;
                        }
                        if (nameA > nameB) {
                            return 1;
                        }

                        // names must be equal
                        return 0;
                    });
                    leagueData['leaderboard'].forEach((userRow, index) => {
                        userRow['rank'] = index + 1;
                        // userRow['rankText'] =
                        // if we have this user updated pickList then we replace it
                        if(leagueUpdateMap[leagueId].hasOwnProperty(userRow['userId'])){
                            console.log("found user");
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
    }

    while(working){}

    return null;


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
});

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
exports.helloWorld = functions.https.onRequest(async (request, response) => {

    response.send(`Processing`);
});
