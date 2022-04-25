const Constants = require("./Constants");
const fdClientModule = require("fantasydata-node-client");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

module.exports = async (context) => {
    let startDate = new Date();
    let endDate = new Date();
    startDate.setDate(startDate.getDate() - 2);
    endDate.setDate(endDate.getDate()+2);
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
                        scorePickList(pickList);

                        await admin.firestore().collection("pickLists").doc(doc.id).set(pickList);

                        if (!leagueUpdateMap.hasOwnProperty(pickList['leagueId'])) {
                            leagueUpdateMap[pickList['leagueId']] = {};
                        }

                        if (!leagueUpdateMap[pickList['leagueId']].hasOwnProperty(pickList['userId'])) {
                            leagueUpdateMap[pickList['leagueId']][pickList['userId']] = pickList['score'];
                        } else {
                            leagueUpdateMap[pickList['leagueId']][pickList['userId']] += pickList['score'];
                        }


                        if(!pickList['active'] && leagueUpdateMap[pickList['leagueId']]['saveScores'] !== true){
                            leagueUpdateMap[pickList['leagueId']]['saveScores'] = true;
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

            saveScores(leagueData, leagueUpdateMap, leagueId)

            await admin.firestore().collection("leagues").doc(leagueId).set(leagueData);
        });
    }

    return null;

    // save the scores permanently in the scoresData. We only do this if all picks are completed
    // also save scores to the leaderboard unless we've saved score recently
    function saveScores(leagueData, leagueUpdateMap, leagueId) {
        let saveBool = false;
        let updateLeaderboard = true;

        // check if we need to save ScoresData by first checking if we've already updated in the last 7 days
        // Otherwise, since the score function runs every X minutes, we will increase forever
        // we need to also check if we should update the leaderboard which we should not if it's been updated in the last day
        // Otherwise, we will double count this week's total
        if(leagueData['scoresData'].hasOwnProperty('updatedAt')){
            // has it been more than a day?
            let now = new Date();
            now.setDate(now.getDate());
            let updatedScoresAt = new Date(leagueData['scoresData']['updatedAt']);
            let updateLeaderboardsAt = new Date(leagueData['scoresData']['updatedAt']);
            updatedScoresAt.setDate(updatedScoresAt.getDate() + 7);
            updatedScoresAt = updatedScoresAt.toISOString();

            updateLeaderboardsAt.setDate(updateLeaderboardsAt.getDate() + 1);
            updateLeaderboardsAt = updateLeaderboardsAt.toISOString();
            now = now.toISOString();

            // set the variables
            saveBool = now > updatedScoresAt;
            updateLeaderboard = now > updateLeaderboardsAt;

        } else {
            // we haven't saved yet
            saveBool = true;
        }


        // we only want to update if we haven't updated this week
        // otherwise the new data will save and we will then add this week's calc to this week's calc from the save
        if(updateLeaderboard) {
            leagueData['leaderboard'].forEach((userRow) => {
                // if we have this user updated pickList then we replace it
                if (leagueUpdateMap[leagueId].hasOwnProperty(userRow['userId'])) {
                    userRow['score'] =
                        leagueUpdateMap[leagueId][userRow['userId']] +
                        leagueData['scoresData']['scoresMap'][userRow['userId']];
                }
            })

            leagueData['leaderboard'].sort(sortLeagueScoreboard);
            leagueData['leaderboard'].forEach((userRow, index) => {
                userRow['rank'] = index + 1;
                userRow['rankText'] = getRankText(index + 1);
            })
        }

        // only update once a week after all the picks are set
        if(leagueUpdateMap[leagueId]['saveScores']){
            if(saveBool) {
                // when did we save
                let now = new Date();
                now.setDate(now.getDate());
                leagueData['scoresData']['updatedAt'] = now.toISOString();
                leagueData['leaderboard'].forEach((userRow) => {
                    // update this leaderboard score as the new standard
                    if(leagueUpdateMap[leagueId].hasOwnProperty(userRow['userId'])) {
                        leagueData['scoresData']['scoresMap'][userRow['userId']] = userRow['score'];
                    } else {
                        leagueData['scoresData']['scoresMap'][userRow['userId']] = 0.0;
                    }
                })
            }

        }

    }


    function sortLeagueScoreboard(a, b){
        let nameA = a.score;
        let nameB = b.score;
        if (nameA < nameB) {
            return 1;
        }
        if (nameA > nameB) {
            return -1;
        }

        // names must be equal
        return 0;
    }

    // depending on their rank we need to return the text
    function getRankText(rank){
        if(rank === 1){ return "1st"; }
        else if (rank === 2){ return "2nd"; }
        else if (rank === 3){ return "3rd";}
        else if (rank < 21) { return `${rank}th`}
        else{ return rank.toString();}
    }

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
    function scorePickList(pickList) {
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
        pickList['updatedAtScores'] = new Date().toISOString();

    }
}
