const Constants = require("./Constants");
const fdClientModule = require("fantasydata-node-client");
const admin = require("firebase-admin");
const SharedFunctions = require("../SharedFunctions");
const sharedFunctions = new SharedFunctions();
const functions = require("firebase-functions");

module.exports = async (context) => {

    const FantasyDataClient = new fdClientModule(Constants.keys);
    let oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7); // 7 days from today
    const filterDateTime = oneWeekAgo.toISOString();
    let eventDetailSnapshot = await admin.firestore().collection("eventDetails")
        .where('DateTime', '>=', filterDateTime)
        .orderBy("DateTime", "desc").get().then(querySnapshot => {
        return querySnapshot.docs.map(function(doc) { return doc;})
    });


    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

    let events = JSON.parse(await FantasyDataClient.MMAv3ScoresClient
        .getSchedulePromise("UFC", 2022)).filter(event => event['DateTime'] >= filterDateTime)

    let leagueUpdateMap = {} // {leagueId: {eventId: eventData}}

    for (const event of events) {
        await FantasyDataClient.MMAv3ScoresClient.getEventPromise(event['EventId']).then(async results => {
            results = JSON.parse(results);
            results['Fights']  = results['Fights'].filter(function(f) {
                return f['Order'] && f['Status'] !== 'Canceled' && f['CardSegment']
            })
            results['Fights'].sort(sharedFunctions.sortByOrderFights)
            let eventDetail = eventDetailSnapshot.find(item => item.data()['EventId'] === results['EventId']);

            if (eventDetail) {
                functions.logger.info(`Updating eventDetails ${JSON.stringify(results['EventId'])}`, {structuredData: true});

                // WE NEED TO UPDATE THE EVENT DETAILS FOR FUTURE CARDS AND THEN
                if(counter <= 498){
                    batches[commitCounter].set(admin.firestore().collection('eventDetails').doc(eventDetail.id), results);
                    counter = counter + 1;
                } else {
                    counter = 0;
                    commitCounter = commitCounter + 1;
                    batches[commitCounter] = admin.firestore().batch();
                    batches[commitCounter].set(admin.firestore().collection('eventDetails').doc(eventDetail.id), results);
                }


                // GET ALL PICK LISTS WITH SAME ID AND THEN UPDATE THAT DATA AS WELL
                let pickLists = await admin.firestore().collection("pickLists").where("eventId", "==", results['EventId']).get()
                pickLists.forEach(function(list) {
                   updatePickLists(list, results, counter, commitCounter, batches);
                })
            } else{
                // it doesn't exist so add it
                functions.logger.info(`Adding eventDetails ${JSON.stringify(results['EventId'])}`, {structuredData: true});
                await  admin.firestore().collection('eventDetails').add(results);
            }



        }).catch(error => {
            functions.logger.error("Client failed!", {structuredData: true});
            functions.logger.error(error, {structuredData: true});
        })
    }

    // we need to update leagues
    let leagueIds = Object.keys(leagueUpdateMap);

    while(leagueIds.length) {
        let thisTen = leagueIds.splice(0,10);
        await admin.firestore().collection('leagues').where(admin.firestore.FieldPath.documentId(), 'in', thisTen).get()
            .then(function(leagues){
                leagues.docs.forEach(function(league){
                    updateLeagueData(league, counter, commitCounter, batches)
                });
            })

    }



    await sharedFunctions.writeToDb(batches);

    return null;


    // this will try to find the fight data in the pickList. If we find it then replace the data, if there is a clash of order
    // then we need to remove the old one because we assume it's been replaced
    // otherwise we just add it because we will be sorting it later
    function updateFightData(fight, listData) {
        // exclude early prelims
        if(!(fight['CardSegment'] === 'Early Prelims')){
            // if the pick list doesn't allow prelims we don't want them either
            // always allow main card events
            if((fight['CardSegment'] === 'Prelims' && listData['prelims']) || fight['CardSegment'] === 'Main Card'){

                let pickIndex = listData['picks'].findIndex(item => item['fightData']['FightId'] === fight['FightId']);

                // we don't want these ones

                if(pickIndex !== -1){
                    // replace the current fight data
                    listData['picks'][pickIndex]['fightData'] = fight;
                } else {
                    // if there is an item in the list that has the same order we need to remove it
                    let foundIndex = listData['picks'].findIndex(item => item['fightData']['Order'] === fight['Order']);
                    if(foundIndex !== -1){
                        listData['picks'].splice(foundIndex,1)
                    }
                    // then add the new item
                    listData['picks'].push({
                        perfectHit: false,
                        fighterIdChosen: null,
                        roundChosen: null,
                        FotNBool: false,
                        correctWinnerBool: null,
                        fightData: fight,
                        score: 0,
                        methodChosen: null,
                    });
                }
            }
        }
    }

    // take a pick list and update the event data and then update the fighter data and finally sort and add to batch
    function updatePickLists(list, results, counter, commitCounter, batches){
        let updateId = list.id;
        let listData = list.data();

        // update event data
        listData['event'] = results;
        if(leagueUpdateMap.hasOwnProperty(listData['leagueId'])){
            if(!leagueUpdateMap[listData['leagueId']].hasOwnProperty(results['EventId'])){
                leagueUpdateMap[listData['leagueId']][results['EventId']] = results;
            }
        } else {
            leagueUpdateMap[listData['leagueId']] = {[results['EventId']]: results};
        }
        // for each pick list, let's update the fight data
        results['Fights'].forEach(function(fight) {
            updateFightData(fight, listData);
        })

        let indexesToRemove = [];
        // we need to check that all the current fight data are still
        listData['picks'].forEach(function (list) {

            // get result
            let resultIndex = results['Fights'].findIndex(item => list['fightData']['FightId'] === item['FightId']);
            const fighterResult = results['Fights'][resultIndex];

            if(resultIndex === -1 ) {
                // fight doesn't exist so we need to remove this
                let pickIndex = listData['picks'].findIndex(item => item['fightData']['FightId'] === list['fightData']['FightId']);
                indexesToRemove.push(pickIndex)
            } else if (fighterResult['CardSegment'] !== 'Main Card' && fighterResult['CardSegment'] !== 'Prelims') {
                let pickIndex = listData['picks'].findIndex(item => item['fightData']['FightId'] === list['fightData']['FightId']);
                indexesToRemove.push(pickIndex)
            } else {
                // check order and CardSegment
                let orderBool = fighterResult['Order'] === list['fightData']['Order'];
                let cardSegmentBool = fighterResult['CardSegment'] === list['fightData']['CardSegment'];

                // if the same do nothing otherwise check if this list has prelims or not and remove or keep based on value
                if (orderBool && cardSegmentBool) {}
                else {
                    // if segment in results does not equal Prelims or Main Card we remove
                    if (fighterResult['CardSegment'] !== 'Main Card' && fighterResult['CardSegment'] !== 'Prelims') {
                        let pickIndex = listData['picks'].findIndex(item => item['fightData']['FightId'] === list['fightData']['FightId']);
                        indexesToRemove.push(pickIndex)
                    } else {
                        if ( !list['prelims'] && fighterResult['CardSegment'] === 'Prelims') {
                            let pickIndex = listData['picks'].findIndex(item => item['fightData']['FightId'] === list['fightData']['FightId']);
                            indexesToRemove.push(pickIndex)
                        }
                    }
                }
            }


        });

        indexesToRemove.sort().reverse();

        for (const index of indexesToRemove) {
            listData['picks'].splice(index,1)
        }

        listData['picks'].sort(sharedFunctions.sortByOrderPicks);

        if(counter <= 498){
            batches[commitCounter].set(admin.firestore().collection('pickLists').doc(updateId), listData)
            counter = counter + 1;
        } else {
            counter = 0;
            commitCounter = commitCounter + 1;
            batches[commitCounter] = admin.firestore().batch();
            batches[commitCounter].set(admin.firestore().collection('pickLists').doc(updateId), listData)
        }
    }

    // take a league and update the event data which we use for new PickLists
    function updateLeagueData(league, counter, commitCounter, batches) {
        let eventsToUpdate = leagueUpdateMap[league.id]
        let leagueData = league.data();


        for (let eventUpdateId in eventsToUpdate) {
            eventUpdateId = parseInt(eventUpdateId);
            let index = leagueData['events'].findIndex(event => eventUpdateId === event['EventId'])

            if(index !== -1){
                leagueData['events'][index] = eventsToUpdate[eventUpdateId]
            }
        }

        if(counter <= 498){
            batches[commitCounter].set(admin.firestore().collection('leagues').doc(league.id), leagueData)
            counter = counter + 1;
        } else {
            counter = 0;
            commitCounter = commitCounter + 1;
            batches[commitCounter] = admin.firestore().batch();
            batches[commitCounter].set(admin.firestore().collection('leagues').doc(league.id), leagueData)
        }
    }
}
