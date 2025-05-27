const {onCall, onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();
const {getFirestore} = require("firebase-admin/firestore");