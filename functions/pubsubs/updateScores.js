const Constants = require("./Constants");
const fdClientModule = require("fantasydata-node-client");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const {scorePickList} = require("./Constants");

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
        let saveBool;
        let updateLeaderboard = true;

        if(!leagueData.hasOwnProperty('scoresData')){
            leagueData['scoresData'] = {};
        }

        if(!leagueData['scoresData'].hasOwnProperty('scoresMap')){
            leagueData['scoresData']['scoresMap'] = {};
            leagueData['memberIds'].forEach(function(memberId) {
                if(leagueUpdateMap[leagueId].hasOwnProperty(memberId)) {
                    leagueData['scoresData']['scoresMap'][memberId] = leagueUpdateMap[leagueId][memberId];
                } else {
                    leagueData['scoresData']['scoresMap'][memberId] = 0.0;
                }
            });
        }

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

            console.log(`now ${now}`)
            console.log(`updatedScoresAt ${updatedScoresAt}`)
            console.log(`save bool ${saveBool}`)

            console.log(`updateLeaderboardsAt ${updateLeaderboardsAt}`)
            console.log(`updateLeaderboard ${updateLeaderboard}`)

        } else {
            // we haven't saved yet
            saveBool = true;
        }


        // we only want to update if we haven't updated this week
        // otherwise the new data will save and we will then add this week's calc to this week's calc from the save
        if(updateLeaderboard) {
            console.log('updating Leaderboard');
            leagueData['leaderboard'].forEach((userRow) => {
                // if we have this user updated pickList then we replace it
                if (leagueUpdateMap[leagueId].hasOwnProperty(userRow['userId'])) {
                    userRow['score'] =
                        leagueUpdateMap[leagueId][userRow['userId']] +
                        leagueData['scoresData']['scoresMap'][userRow['userId']] || 0;
                }
            })

            leagueData['leaderboard'].sort(sortLeagueScoreboard);
            leagueData['leaderboard'].forEach((userRow, index) => {
                userRow['rank'] = index + 1;
                userRow['rankText'] = getRankText(index + 1);
            })

            console.log(JSON.stringify(leagueData['leaderboard']));
        }

        // only update once a week after all the picks are set
        if(leagueUpdateMap[leagueId]['saveScores']){
            if(saveBool) {
                console.log("Permanently updating scores for the week")
                // when did we save
                let now = new Date();
                // let now = new Date(2022,6,3,9);

                now.setDate(now.getDate());
                leagueData['scoresData']['updatedAt'] = now.toISOString();
                leagueData['leaderboard'].forEach((userRow) => {
                    leagueData['scoresData']['scoresMap'][userRow['userId']] = userRow['score'];
                })

                console.log(JSON.stringify(leagueData['scoresData']['scoresMap']))
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
}
