import { onDocumentCreated} from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";

initializeApp();
const db = getFirestore();

exports.usersCountIncrement = onDocumentCreated("users/{userId}", async (event) => {
  const userId = event.params.userId;
  const userData = event.data?.data();

  const counterRef = db.doc("dashboard/users/counter");
  const userLogRef = db.doc(`dashboard/users_log/${userId}`);

  try {
    await Promise.all([
      // Incrementa contador
      counterRef.set(
        { total: FieldValue.increment(1) },
        { merge: true }
      ),

      // Cria log do usuário
      userLogRef.set({
        email: userData?.email || null,
        createdAt: new Date().toISOString(),
      }),
    ]);

    //console.log("Contador incrementado e log do usuário criado.");
  } catch (error) {
    console.error("Erro:", error);
  }
});