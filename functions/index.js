
const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
admin.initializeApp();

exports.teste = onCall((request) => {
  logger.info("Hello logs!", {structuredData: true});
  return {text: "Hello from Function!", data:
    {...request.data,
      context: request.auth,
    },
  };
});
