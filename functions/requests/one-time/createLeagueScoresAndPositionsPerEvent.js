/**
 * 2023/01/03
 * The need to have last week's leaderboard position and score is required. This will add two new maps to the scoresData
 * scoresPerWeek - map with date as key, value a map with user_id as key and the points for that week as value
 * positionPerWeek - maps with date as key, value a map with user_id as key and the leaderboard position as value
 */

const FantasyAnalyticsClient = require("../../fa_api/fa_client");
const admin = require("firebase-admin");
const SharedFunctions = require("../../SharedFunctions");
const sharedFunctions = new SharedFunctions();
module.exports = async (request) => {
    let client = new FantasyAnalyticsClient();
    let now = new Date();
    const filterDateTime = now.toISOString();
    await client.login();
    let startYear = "2023"; // for one time we will have this at 2022

    let leagues = await admin.firestore().collection("leagues").where("createdAt", ">=", startYear).get().then(querySnapshot => {
        return querySnapshot.docs.map(doc => doc)
    });

    let counter = 0;
    let commitCounter = 0;
    let batches = [];

    batches[commitCounter] = admin.firestore().batch();


    for (const league of leagues ) {
        if(counter > 10) {
            await sharedFunctions.writeToDb(batches);
            counter = 0;
            commitCounter = 0;
            batches = [];

            batches[commitCounter] = admin.firestore().batch();
        }

        const leagueId = league.id;
        let leagueData = league.data();
        let totalWeekScoreMap = {} // userId -> totalScore

        let scoresPerWeek = {
            'default': {}
        }; // date -> [{userId-> score}]
        let positionPerWeek = {
            'default': {}
        }; // date -> [{userId -> position}]

        for (const userId of leagueData['memberIds']) {
            scoresPerWeek['default'][userId] = 0;
            positionPerWeek['default'][userId] = 1;
        }

        if(leagueData.hasOwnProperty('events')) {
            for (const event of leagueData['events']) {
                if(event['DateTime'] > filterDateTime) continue; // skip future events

                let pickLists = await admin.firestore().collection("pickLists")
                    .where("eventId", "==", event['EventId'])
                    .where("leagueId", "==", leagueId).get();
                pickLists = pickLists.docs;
                let thisWeekScoreMap = {} // userId -> score
                let thisWeekPositionMap = {} // userId -> position
                for (const pickList of pickLists) {
                    const pickListData = pickList.data();
                    const userId = pickListData['userId'];
                    thisWeekScoreMap[userId] = pickListData['score'];
                    if(!totalWeekScoreMap.hasOwnProperty(userId)) totalWeekScoreMap[userId] = 0;
                    totalWeekScoreMap[userId] += thisWeekScoreMap[userId];
                }


                // add the value of the users that didn't set picks this week
                for (const userId of leagueData['memberIds']) {
                    if(!thisWeekScoreMap.hasOwnProperty(userId)) {
                        if(!totalWeekScoreMap.hasOwnProperty(userId)) totalWeekScoreMap[userId] = 0;
                        thisWeekScoreMap[userId] = 0;
                    }
                }



                // sort by value
                const sortable = Object.fromEntries(
                    Object.entries(totalWeekScoreMap).sort(([,a],[,b]) => b-a)
                );


                // create the position that week
                let lastValue = -1; // if the last rank value is the same then we will use the previousRank
                let previousRank = 1;
                Object.entries(sortable).forEach(function(e, index) {
                    let possibleRank = index + 1;
                    const userId = e[0];
                    const thisScore = e[1];
                    if(lastValue === thisScore) {
                        possibleRank = previousRank;
                    } else {
                        previousRank = possibleRank;
                    }
                    lastValue = thisScore;
                    thisWeekPositionMap[userId] = possibleRank; // id -> userId -> position
                })

                // add to main objects
                scoresPerWeek[event['Day']] = thisWeekScoreMap;
                positionPerWeek[event['Day']] = thisWeekPositionMap;
            }
        }


        leagueData['scoresPerWeek'] = scoresPerWeek;
        leagueData['positionPerWeek'] = positionPerWeek;



        batches[commitCounter].set(admin.firestore().collection('leagues').doc(leagueId), leagueData)
        counter = counter + 1;
    }


    await sharedFunctions.writeToDb(batches);
    return null;

}