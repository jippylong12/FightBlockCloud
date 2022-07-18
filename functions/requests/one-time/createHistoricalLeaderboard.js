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
const {scorePickList} = require("../../pubsubs/Constants");

module.exports = async (request, response) => {
    let startDate = new Date(2022,0,1);
    // this needs to be a few hours after the ending of the fights for the last fight. Run Upadatescores after this so that it will update the leadboard
    let endDate = new Date(2022, 6, 17, 4,0,0);
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

}
