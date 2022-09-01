
module.exports = function () {
    this.oneSecond = function () {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve('resolved');
            }, 1010);
        });
    }

    this.writeToDb = async function (arr) {
        console.log("beginning write");
        for (let i = 0; i < arr.length; i++) {
            await this.oneSecond();
            try {
                await arr[i].commit().then(function () {
                    console.log("wrote batch " + i + 1);
                });
            } catch (e) {
                console.log(e);
            }

        }
        console.log("done.");
    }

    this.sortByOrderPicks = function ( a, b ){
        if ( a['fightData']['Order'] < b['fightData']['Order'] ){
            return 1;
        }
        if ( a['fightData']['Order'] > b['fightData']['Order'] ){
            return -1;
        }
        return 0;
    }

    this.sortByOrderFights = function ( a, b ){
        if ( a['Order'] < b['Order'] ){
            return 1;
        }
        if ( a['Order'] > b['Order'] ){
            return -1;
        }
        return 0;
    }
}


