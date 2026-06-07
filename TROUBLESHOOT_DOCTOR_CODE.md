# 🔧 Guide Dépannage - Code Médecin (Patient Signup)

## 📋 Le Problème
Lors du signup d'un patient, l'insertion du code du docteur génère une erreur.

## ✅ Avant de Contacter le Support

### Étape 1: Vérifiez le Format du Code
Le code du docteur doit être au format: **BB-XXXXXXXX**

**Exemple valide:** `BB-A1B2C3D4`

**Caractéristiques:**
- ✅ Commence par `BB-` (majuscules)
- ✅ Suivi de 8 caractères hexadécimaux (0-9, A-F)
- ❌ Pas d'espaces
- ❌ Pas de tirets supplémentaires
- ❌ Pas de caractères spéciaux

### Étape 2: Obtenez le Vrai Code du Docteur

**Pour le docteur:**
1. Connectez-vous à votre compte docteur
2. Allez à **Settings → Profile**
3. Cherchez la section "Mon Code" ou "Doctor Code"
4. Vous verrez quelque chose comme: `BB-F3A2B1C0`
5. Copiez ce code exactement

**Assurez-vous:**
- ✅ Vous copiez le code complet
- ✅ Pas d'espaces avant ou après
- ✅ C'est le code du DOCTEUR (pas du patient)

### Étape 3: Patient - Lors du Signup

**Au formulaire de signup:**
1. Sélectionnez le rôle: **PATIENT** (pas DOCTOR ni RELATIVE)
2. Remplissez les informations:
   - Nom complet
   - Email
   - Date de naissance
   - Numéro d'urgence (Tunisie)
   - Mot de passe
3. Dans le champ **"Code du Médecin (optionnel)"**, collez le code
4. Cliquez sur **Sign Up**

### Étape 4: Vérifications

**Le code doit:**
- ✅ Exister réellement dans la base de données
- ✅ Appartenir à un utilisateur avec le rôle DOCTOR
- ✅ Être au format correct

**Le patient reçoit une erreur "Code not found" si:**
- ❌ Le code est mal copié
- ❌ Le code n'existe pas
- ❌ Le docteur n'est pas dans la base de données
- ❌ Le format est incorrect

---

## 🔍 Procédure de Diagnostic

### Test 1: Testez dans le Navigateur Console

**Pour les techniciens (F12 → Console):**

```javascript
// Testez la validation du code
const testCode = "BB-A1B2C3D4";
const regex = /^BB-[0-9A-F]{8}$/i;

console.log(regex.test(testCode)); // Doit afficher: true
console.log(testCode.toUpperCase()); // Vérifiez le format
```

### Test 2: Testez l'Endpoint Directement

```bash
# Dans le terminal ou Postman
curl "http://localhost:4001/auth/find-by-code?code=BB-A1B2C3D4&role=DOCTOR"

# Réponse attendue:
# {"id": "some-uuid", "name": "Docteur Name"}

# Réponse d'erreur:
# {"error": "No user found with this code"}
```

### Test 3: Vérifiez la Base de Données

**Pour l'administrateur:**

```sql
-- Remplacez "A1B2C3" par les 8 premiers caractères du code
SELECT id, name, email, role FROM "User" 
WHERE role = 'DOCTOR' AND id LIKE 'a1b2c3%'
LIMIT 5;
```

---

## 🚀 Solutions Rapides

### Solution 1: Oublie du Code (le plus courant!)
**Problème:** Le patient met un code du PATIENT à la place du code du DOCTEUR
**Solution:** Demandez au docteur de partager SON code, pas celui du patient

### Solution 2: Faute de Frappe
**Problème:** Typo dans le code
**Solution:** Copiez directement du profil docteur (évite les erreurs)

### Solution 3: Docteur n'existe pas
**Problème:** Le docteur n'est pas enregistré dans le système
**Solution:** Le docteur doit créer un compte en tant que DOCTOR d'abord

### Solution 4: Cache du Navigateur
**Problème:** Données en cache ancien
**Solution:** 
```
Ctrl+Shift+Delete  // Windows
Cmd+Shift+Delete   // Mac
```
Videz tout, puis rafraîchissez

### Solution 5: Rôle Incorrect
**Problème:** Le docteur a créé un compte avec le rôle PATIENT
**Solution:** Créez un nouveau compte avec le rôle DOCTOR

---

## 📞 Si C'est Toujours un Problème

### Informations à Fournir au Support:

1. **Le code utilisé:** `BB-________` (les 8 caractères)
2. **Le message d'erreur exact** (screenshot)
3. **Navigateur et version** (F12 → Application tab)
4. **Étapes reproduites:**
   - A quelle étape du formulaire?
   - Quel rôle sélectionné?
   - Quel code inséré?

5. **Pour le docteur:**
   - Email du docteur
   - Son code (pour vérification)
   - Quand le compte a été créé

---

## 🔐 Données Sensibles

**Ne partagez PAS publiquement:**
- ❌ Codes complets
- ❌ Emails
- ❌ Mots de passe
- ❌ UUIDs

**Partager avec Support SEULEMENT:**
- ✅ Les 4-5 premiers caractères du code
- ✅ Email générique (ex: doctor@test.com)
- ✅ Contexte du problème

---

## 📝 Notes Supplémentaires

### Sur la Génération de Codes:
- Chaque docteur a UN SEUL code
- Le code est basé sur l'UUID du docteur
- Le code ne change jamais (sauf suppression/recréation du compte)
- Format: `BB-` + 8 premiers caractères hex de l'UUID

### Sur la Sécurité:
- Les codes ne peuvent pas être devinés
- Chaque code est unique
- Personne d'autre ne peut avoir le même code

### Sur le Processus:
1. Patient signup → enter doctor code
2. Backend vérifie le code
3. Lie le patient au docteur (relation 1-to-many)
4. Docteur voit le patient dans sa liste

---

## ✨ Alternative: Lier Plus Tard

**Vous n'êtes pas obligé de lier immédiatement!**

Le patient peut:
1. Créer son compte SANS code docteur
2. Le docteur ajoute le patient depuis son **Dashboard → Patients → Add Patient**
3. Ou le patient ajoute le docteur depuis **Settings → Link Doctor**

---

**Dernière mise à jour:** 2026-06-07  
**Support:** Contactez l'équipe technique
