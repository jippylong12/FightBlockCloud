
# Helpful things to know

## Run emulator 
```shell
firebase emulators:start
```

## Run with import data 
(see below how to get the latest data)
```shell
firebase emulators:start --import="/Users/marcus.salinas/fbExport/"
```

## Push to production
```shell
firebase deploy --only functions
```

## Getting Started Doc
https://firebase.google.com/docs/functions/get-started

## Localhost UI Url
http://localhost:4000/functions 

## Localhost testUrl
http://localhost:5001/fight-block/us-central1/helloWorld

### Export DB
#### Create
https://console.cloud.google.com/firestore/import-export?project=fight-block

#### Download
You can find the folder name under the Bucket column
```shell
gsutil -m cp -r \
  "gs://development-exports/2022-11-03T14:14:07_23624" \
  .
rm -rf ~/fbExport && 
mkdir ~/fbExport && 
mv 2022-11-03T14:14:07_23624/* ~/fbExport/ && 
rm -rf 2022-11-03T14:14:07_23624
```
