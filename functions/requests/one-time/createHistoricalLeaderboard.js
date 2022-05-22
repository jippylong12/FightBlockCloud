/**
 * 2022/04/25
 * We ran into a problem with update scores because we only added the score from last week. So to add all the scores we
 * would have to recalculate all the scores every week. So instead, we need to run this once to generate that sum and then
 * each week we can use updateScore to set the new historical
 */
const admin = require("firebase-admin");
const fdClientModule = require("fantasydata-node-client");
const Constants = require("../../pubsubs/Constants");
const functions = require("firebase-functions");

module.exports = async (request, response) => {
    let startDate = new Date(2022,0,1);
    let endDate = new Date();
    endDate.setDate(endDate.getDate()-7);
    let isoStringStart = startDate.toISOString();
    let isoStringEnd = endDate.toISOString();

    const FantasyDataClient = new fdClientModule(Constants.keys);
    let snapshot = await admin.firestore().collection("eventDetails")
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
                .where("eventId","==", event['EventId']).get().then(async pickListsSnapshot => {

                    for (const doc of pickListsSnapshot.docs) {
                        let pickList = doc.data();


                        // replace the fight data with the right data
                        pickList['picks'].forEach(pick => {
                            results['Fights'].forEach((fight) => {
                                if (pick['fightData']['FightId'] === fight['FightId']) {
                                    if (fight['ResultType'] === null) {
                                        fight['ResultType'] = "";
                                    }

                                    pick['fightData'] = fight;
                                }
                            });
                        });

                        // score the pickList
                        scorePickList(pickList, isoStringEnd);

                        if (!leagueUpdateMap.hasOwnProperty(pickList['leagueId'])) {
                            leagueUpdateMap[pickList['leagueId']] = {};
                        }

                        if (!leagueUpdateMap[pickList['leagueId']].hasOwnProperty(pickList['userId'])) {
                            leagueUpdateMap[pickList['leagueId']][pickList['userId']] = pickList['score'];
                        } else {
                            leagueUpdateMap[pickList['leagueId']][pickList['userId']] += pickList['score'];
                        }
                    }
                });


        }).catch(error => {
            functions.logger.error("Client failed!", {structuredData: true});
            functions.logger.error(error, {structuredData: true});
        })
    }


    console.log("League Update Map");
    console.log(JSON.stringify(leagueUpdateMap));

    // update the league leaderboard
    for( let leagueId in leagueUpdateMap){
        await admin.firestore().collection("leagues").doc(leagueId).get().then(async docSnapshot => {
            let leagueData = docSnapshot.data();

            if(!leagueData.hasOwnProperty('scoresData')){
                leagueData['scoresData'] = {};
            }

            if(!leagueData['scoresData'].hasOwnProperty('scoresMap')){
                leagueData['scoresData']['scoresMap'] = {};
            }
            leagueData['memberIds'].forEach(function(memberId) {
                if(leagueUpdateMap[leagueId].hasOwnProperty(memberId)) {
                    leagueData['scoresData']['scoresMap'][memberId] = leagueUpdateMap[leagueId][memberId];
                } else {
                    leagueData['scoresData']['scoresMap'][memberId] = 0.0;
                }
            });

            leagueData['scoresData']['updatedAt'] = isoStringEnd;
            await admin.firestore().collection("leagues").doc(leagueId).set(leagueData);
        });
    }

    response.send(`Processed`);


    function correctChosenFighter(pick) {
        return pick['fighterIdChosen'] === pick['fightData']['WinnerId'];
    }

    function correctChosenMethod(pick) {
        if(pick['fightData']['ResultType'] === null){
            return false;
        } else{
            return pick['fightData']['ResultType'].includes(pick['methodChosen']);
        }
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
                pick['correctWinnerBool'] = true;
                pickedWinner = true;
                pick['score'] += 2;
                // method correct?
                if (correctChosenMethod(pick)) {
                    if (pick['methodChosen'] === 'Decision') {
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
                } else if(correctChosenRound(pick) && !pick['fightData']['ResultType'].includes('Decision')){
                    // decision results come in as the last round so we just ignore them
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
    function scorePickList(pickList, isoStringEnd) {
        pickList['score'] = 0;
        pickList['locked'] = true;
        let boutWinnerCount = 0;
        let finalizeCount = 0; // if all picks are in the final state we want to finalize the PickCard
        pickList['picks'].forEach(function(thisPick) {

            if(scorePick(thisPick)){
                boutWinnerCount += 1;
            }

            if(thisPick['fightData']['Status'] === 'Final'){
                finalizeCount += 1;
            }

            pickList['score'] += thisPick['score'];
        });

        // if we pick all winners then we give the Parlay bonus
        if (boutWinnerCount === pickList['picks'].length) {
            pickList['parlayBonus'] = true;
            pickList['picks'].forEach(function(thisPick) {
                thisPick['score'] += 4;
                pickList['score'] += thisPick['score'];
            });
        }

        if(finalizeCount === pickList['picks'].length){
            pickList['active'] = false;
        }

        // update the time
        pickList['updatedAtScores'] = isoStringEnd;

    }

}
