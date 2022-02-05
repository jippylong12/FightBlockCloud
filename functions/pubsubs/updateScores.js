const Constants = require("./Constants");
const fdClientModule = require("fantasydata-node-client");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

module.exports = async (context) => {

    let working = true;
    let startDate = new Date();
    let endDate = new Date();
    endDate.setDate(endDate.getDate()+2);
    startDate.setDate(startDate.getDate()-2);
    let isoStringStart = startDate.toISOString();
    let isoStringEnd = endDate.toISOString();

    const FantasyDataClient = new fdClientModule(Constants.keys);
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

                    leagueData['leaderboard'].sort(sortLeagueScoreboard);
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


    function sortLeagueScoreboard(a, b){
        let nameA = a.score;
        let nameB = b.score;
        if (nameA < nameB) {
            return -1;
        }
        if (nameA > nameB) {
            return 1;
        }

        // names must be equal
        return 0;
    }

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

        // update the time
        pickList['updatedAtScores'] = new Date().toISOString();

    }
}
