import { onDocumentDeleted} from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";

initializeApp();
const db = getFirestore();
exports.usersCountDecrement = onDocumentDeleted("users/{userId}", async (event) => {
  const userId = event.params.userId;

  const counterRef = db.doc("dashboard/users/counter");
  const userLogRef = db.doc(`dashboard/users_log/${userId}`);

  try {
    await Promise.all([
      // Decrementa contador
      counterRef.set(
        { total: FieldValue.increment(-1) },
        { merge: true }
      ),

      // Remove o log do usuário
      userLogRef.delete(),
    ]);

    console.log("Contador decrementado e log do usuário removido.");
  } catch (error) {
    console.error("Erro:", error);
  }
});