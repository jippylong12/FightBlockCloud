const Constants = require("../pubsubs/Constants");
const axios = require('axios').default;

class FantasyAnalyticsClient {
    authToken = '';
    baseUrl = 'https://fight-api.herokuapp.com';
    authorizedPromotionIds = [1, 64];

    async login() {
        if (!this.authorized()) {
            await axios.post(`${this.baseUrl}/security/token`, {
                    'username': Constants.keys.FAUsername,
                    'password': Constants.keys.FAPassword,
                }
                ,)
                .then((data) => {
                    this.authToken = data.data.token;
                    return true;
                }).catch((err) => false);
        }
    }

    authorized() {
        return this.authToken !== '';
    }

    async getEvents() {
        if (this.authorized()) {
            let data = await axios.get(`${this.baseUrl}/events?pageSize=50`, {
                headers: {
                    'Authorization': this.authToken,
                },
            })
                .then((data) => {
                    let d = data.data;
                    d = d.filter((event) => this.authorizedPromotionIds.includes(event['promotionId'])).map((event) => {
                        event['date'] = event['date'].replace("Z", "");
                        return event;
                    });
                    return d;
                }).catch((err) => {
                    return {};
                });

            return data;
        } else {
            return {};
        }
    }

    async getEvent(id) {
        let _data = await axios.get(`${this.baseUrl}/fight/event/${id}`, { headers: {
                'Authorization': this.authToken,
            },}).then((response) => {
            return response.data;
        }).catch((response) => {
            console.log(response);
        })

        return _data;
    }


    async getFighter(id) {
        let _data = await axios.get(`${this.baseUrl}/fighters/${id}`, { headers: {
                'Authorization': this.authToken,
            },}).then((response) => {
            return response.data;
        }).catch((response) => {
            console.log(response);
        })

        return _data;
    }
}


module.exports = FantasyAnalyticsClient;
