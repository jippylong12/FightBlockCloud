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
    let eventDetailSnapshot = await admin.firestore().collection("eventDetails").where('DateTime', '>=', filterDateTime).orderBy("DateTime", "desc").get().then(querySnapshot => {
        return querySnapshot.docs.map(function(doc) { return doc;})
    });


    let counter = 0;
    let commitCounter = 0;
    let batches = [];
    batches[commitCounter] = admin.firestore().batch();

    let events = JSON.parse(await FantasyDataClient.MMAv3ScoresClient.getSchedulePromise("UFC", 2022)).filter(event => event['DateTime'] >= filterDateTime)

    let leagueUpdateMap = {} // {leagueId: {eventId: eventData}}

    for (const event of events) {
        await FantasyDataClient.MMAv3ScoresClient.getEventPromise(event['EventId']).then(async results => {
            results = JSON.parse(results);
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
                        // exclude early prelims
                        if(!(fight['CardSegment'] === null) && !(fight['CardSegment'] === 'Early Prelims')){
                            // if the pick list doesn't allow prelims we don't want them either
                            // always allow main card events
                            if((fight['CardSegment'] === 'Prelims' && listData['prelims']) || fight['CardSegment'] === 'Main Card'){

                                let pickIndex = listData['picks'].findIndex(item => item['fightData']['Order'] === fight['Order']);

                                // we don't want these ones

                                if(pickIndex !== -1){
                                    // replace the current fight data
                                    listData['picks'][pickIndex]['fightData'] = fight;
                                } else {
                                    // add the new item
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

                    })
                    listData['picks'].sort(sharedFunctions.sortByOrder);

                    if(counter <= 498){
                        batches[commitCounter].set(admin.firestore().collection('pickLists').doc(updateId), listData)
                        counter = counter + 1;
                    } else {
                        counter = 0;
                        commitCounter = commitCounter + 1;
                        batches[commitCounter] = admin.firestore().batch();
                        batches[commitCounter].set(admin.firestore().collection('pickLists').doc(updateId), listData)
                    }
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
                    let eventsToUpdate = leagueUpdateMap[league.id]
                    let leagueData = league.data();

                    let index = leagueData['events'].findIndex(event => eventsToUpdate.hasOwnProperty(event['EventId']))

                    if(index !== -1){
                        let event = leagueData['events'][index];
                        leagueData['events'][index] = eventsToUpdate[event['EventId']]
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
                });
            })

    }



    await sharedFunctions.writeToDb(batches);

    return null;
}
