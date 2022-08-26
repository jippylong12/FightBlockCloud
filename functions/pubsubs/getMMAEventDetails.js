const admin = require("firebase-admin");
const SharedFunctions = require("../SharedFunctions");
const sharedFunctions = new SharedFunctions();
const functions = require("firebase-functions");
const FantasyAnalyticsClient = require("../fa_api/fa_client");

module.exports = async (context) => {
    let client = new FantasyAnalyticsClient();
    await client.login();

    let oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7); // 7 days from today
    const filterDateTime = oneWeekAgo.toISOString();
    let eventDetailSnapshot = await admin.firestore().collection("apis/v2/eventDetails")
        .where('DateTime', '>=', filterDateTime)
        .orderBy("DateTime", "desc").get().then(querySnapshot => {
        return querySnapshot.docs.map(function(doc) { return doc;})
    });






    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

    let events = await client.getEvents();
    events = events.filter(event => event['date'] >= filterDateTime)


    let leagueUpdateMap = {} // {leagueId: {eventId: eventData}}

    for (const event of events) {
        const eventId = event.id;
        await client.getEvent(eventId).then(async results => {
            results = transformData(event,results);

            results['Fights']  = results['Fights'].filter(function(f) {
                return f['Order'] && f['Status'] !== 'Canceled'
            })
            results['Fights'].sort(sharedFunctions.sortByOrderFights)
            let eventDetail = eventDetailSnapshot.find(item => item.data()['EventId'] === eventId);

            if (eventDetail) {
                functions.logger.info(`Updating eventDetails ${JSON.stringify(eventId)}`, {structuredData: true});

                // WE NEED TO UPDATE THE EVENT DETAILS FOR FUTURE CARDS AND THEN
                if(counter <= 498){
                    batches[commitCounter].set(admin.firestore().collection('apis/v2/eventDetails').doc(eventDetail.id), results);
                    counter = counter + 1;
                } else {
                    counter = 0;
                    commitCounter = commitCounter + 1;
                    batches[commitCounter] = admin.firestore().batch();
                    batches[commitCounter].set(admin.firestore().collection('apis/v2/eventDetails').doc(eventDetail.id), results);
                }


                // GET ALL PICK LISTS WITH SAME ID AND THEN UPDATE THAT DATA AS WELL
                let pickLists = await admin.firestore().collection("pickLists").where("eventId", "==", eventId).get()
                pickLists.forEach(function(list) {
                   updatePickLists(list, results, counter, commitCounter, batches);
                })
            } else{
                // it doesn't exist so add it
                functions.logger.info(`Adding eventDetails ${JSON.stringify(eventId)}`, {structuredData: true});
                await  admin.firestore().collection('apis/v2/eventDetails').add(results);
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
    function updateFightData(fight, listData, recentFightIds, allFightIds) {
        // exclude early prelims
        if(!(fight['CardSegment'] === 'Early Prelims')){
            // if the pick list doesn't allow prelims we don't want them either
            // always allow main card events
            if((fight['CardSegment'] === 'Prelims' && listData['prelims']) || fight['CardSegment'] === 'Main Card'){
                allFightIds[fight['FightId']] = null;

                let pickIndex = listData['picks'].findIndex(item => item['fightData']['FightId'] === fight['FightId']);


                if(pickIndex !== -1){
                    // replace the current fight data if we find the same fightID
                    listData['picks'][pickIndex]['fightData'] = fight;
                } else {
                    // the fight no longer exists
                    // if there is an item in the list that has the same order we need to remove it
                    let foundIndex = listData['picks'].findIndex(item => item['fightData']['Order'] === fight['Order']);
                    if(foundIndex !== -1){
                        recentFightIds[fight['Order']] = fight['FightId']
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
        let recentFightIds = {}; // order => fightId We need to keep track of the most recent fight IDs so we know which to remove
        let allFightIds = {}; // we will go through the array one more time to make sure that we keep only those available
        results['Fights'].forEach(function(fight) {
            updateFightData(fight, listData, recentFightIds, allFightIds);
        })

        // add new Fights, update any old fight data
        listData['picks'] = listData['picks'].filter(function(pick) {
            const order = pick['fightData']['Order']
            if(recentFightIds.hasOwnProperty(order)) {
                // if we don't match then we need to remove it otherwise we will retunr it because it's the latest one
                return recentFightIds[order] === pick['fightData']['FightId'];
            } else {
                return true;
            }
        });

        // filter out any fight ids we haven't seen.
        listData['picks'] = listData['picks'].filter(function(pick) {
            const fightId = pick['fightData']['FightId'];
            return allFightIds.hasOwnProperty(fightId);
        });

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
            } else {
                leagueData['events'].push(eventsToUpdate[eventUpdateId])
            }
        }

        leagueData['events'].sort(sortByDateTime)

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

    function sortByDateTime ( a, b ) {
        if ( a['DateTime'] > b['DateTime'] ){
            return 1;
        }
        if (  a['DateTime'] < b['DateTime']  ){
            return -1;
        }
        return 0;
    }

    // convert API v2 data to how the DB is formed in v1
    function transformData(event, results) {
        for(const r of results) {
            updateFightKeys(r, results.length);
        }

        event['EventId'] = event['id'];
        event['Day']  = event['date'];
        event['DateTime'] = new Date(`${event['date'].split("T")[0].trim()} ${event['time']} Z`).toISOString().replace("Z", "");
        event['Name'] = event['name'];
        event['ShortName'] = event['name'].split(":")[0].trim();
        event['Status'] = setStatus(results)

        delete event['id'];
        delete event['time'];
        delete event['date'];
        delete event['name'];




        results = {
            'Active': true,
            'Fights': results,
        }

        return Object.assign(event, results);


        function setStatus(fights) {
            for (const fight of fights) {
                if(fight['Status'] !== 'Final'){
                    return 'Active';
                }
            }

            return 'Final';
        }

        function updateFightKeys(fight, length) {
            updateFighterObject(fight['fighterRed']);
            updateFighterObject(fight['fighterBlue']);
            fight['Fighters'] = [
                fight['fighterRed'],
                fight['fighterBlue'],
            ];
            fight['Order'] = (length + 1) - fight['order'];
            fight['EventId'] = fight['eventId'];
            fight['Status'] = chooseFightStatus(fight);
            fight['WinnerId'] = chooseWinner(fight);
            fight['ResultType'] = chooseFinishType(fight);
            fight['ResultRound'] = fight['finishedAtRound'];
            fight['Rounds'] = fight['totalRound'];
            fight['CardSegment'] = chooseCardSegment(fight);

            delete fight['order'];
            delete fight['eventId'];
            delete fight['winner'];
            delete fight['fightStatus'];
            delete fight['fighterBlue'];
            delete fight['fighterRed'];
            delete fight['finishType'];
            delete fight['finishedAtRound'];
            delete fight['totalRound'];
            delete fight['fighterRedId'];
            delete fight['fighterBlueId'];

        }

        function updateFighterObject(fighter) {
            fighter['FighterId'] = fighter['id'];
            fighter['FirstName'] = fighter['firstName'];
            fighter['LastName'] = fighter['lastName'];

            delete fighter['id'];
            delete fighter['firstName'];
            delete fighter['lastName'];
        }

        function chooseWinner(fight) {
            if(fight['winner'] === "Not available yet"){
                return null;
            } else {
                const winnerName = fight['winner'];
                const fighterOneName = `${fight['Fighters'][0]['FirstName']} ${fight['Fighters'][0]['LastName']}`;
                const fighterTwoName = `${fight['Fighters'][1]['FirstName']} ${fight['Fighters'][1]['LastName']}`;
                if(fighterOneName === winnerName){
                    return fight['Fighters'][0]['FighterId'];
                } else if (fighterTwoName === winnerName){
                    return fight['Fighters'][1]['FighterId'];
                } else {
                    return null;
                }
            }
        }

        // if we are order 6 or above we assume main card
        function chooseCardSegment(fight) {
            if(fight['Order'] <= 6) {
                return 'Main Card';
            } else if (fight['Order'] <= 12) {
                return 'Prelims';
            } else {
                return 'Early Prelims';
            }
        }

        function chooseFinishType(fight) {
            if(['Maj.', 'Dec.', 'Draw'].includes(fight['finishType'])) {
                return 'Decision';
            } else if (fight['finishType'] === 'Sub.'){
                return 'Submission';
            } else if (fight['finishType'] === 'TKO/KO') {
                return 'KO/TKO'
            } else {
                return fight['finishType'];
            }
        }

        function chooseFightStatus(fight) {
            if(fight['fightStatus'] === 'Finished') {
                return 'Final';
            } else {
                return fight['fightStatus'];
            }
        }
    }
}
