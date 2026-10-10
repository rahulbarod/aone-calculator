// Hindi screens. The app is written in English; when a phone chooses Hindi,
// text is translated as it appears on screen. Bills/receipts (printed and
// shared), anything typed into text boxes, and the elements listed in
// USER_DATA (customer/product names) are never translated.

// Exact on-screen texts.
const PHRASES = {
  // home
  'ADD TO BILL': 'बिल बनाएँ', 'ACTIVE BILLS': 'चालू बिल', 'All ›': 'सभी ›', '₹ TODAY\'S SALES': '₹ आज की बिक्री',
  'No open bills right now': 'अभी कोई चालू बिल नहीं', 'REPORTS': 'रिपोर्ट', 'DUES': 'बकाया', 'None': 'कोई नहीं',
  'CUSTOMERS': 'ग्राहक', 'PRODUCTS': 'सामान', 'HISTORY': 'पुराने बिल', 'SETTINGS': 'सेटिंग',
  '☁ Synced': '☁ सिंक हो गया', '⏳ Syncing…': '⏳ सिंक हो रहा है…', '📴 Offline — saved on phone, will sync': '📴 ऑफलाइन — फ़ोन में सेव, बाद में सिंक होगा',
  'Move this phone\'s data to the cloud': 'इस फ़ोन का डेटा क्लाउड पर भेजें', 'Not now': 'अभी नहीं', 'UPLOAD': 'अपलोड करें',
  'Products and customers already in the cloud (same name) are skipped.': 'जो सामान/ग्राहक पहले से हैं (एक ही नाम), वो दोबारा नहीं जुड़ेंगे।',
  'No products yet': 'अभी कोई सामान नहीं', 'ADD SAMPLE PRODUCTS': 'नमूना सामान जोड़ें',
  'Start with the sample list (copper, bearings, scrap…) and edit prices, or add your own under Products.': 'नमूना सूची (कॉपर, बेयरिंग, स्क्रैप…) से शुरू करें और रेट बदलें, या "सामान" में अपना सामान जोड़ें।',
  // sign-in
  'BILLING': 'बिलिंग', 'Sign in to start': 'शुरू करने के लिए साइन इन करें', 'Sign in with Google': 'Google से साइन इन करें',
  'Products, customers and bills are shared live between the shop\'s phones. Sign in once with your Google account.': 'सामान, ग्राहक और बिल दुकान के सभी फ़ोन पर एक साथ दिखते हैं। अपने Google अकाउंट से एक बार साइन इन करें।',
  'After signing in once, the app also works without internet.': 'एक बार साइन इन के बाद ऐप बिना इंटरनेट के भी चलेगा।',
  '📴 You are offline. Connect to the internet once to sign in.': '📴 आप ऑफलाइन हैं। साइन इन के लिए एक बार इंटरनेट चालू करें।',
  'Not allowed': 'अनुमति नहीं', 'This account can\'t open the shop\'s data': 'यह अकाउंट दुकान का डेटा नहीं खोल सकता',
  'Only the Google accounts listed in the Firebase security rules can use this app. Sign out and use the right account, or ask the owner to add this one.': 'सिर्फ़ जोड़े गए Google अकाउंट ही यह ऐप चला सकते हैं। साइन आउट करके सही अकाउंट चुनें, या मालिक से यह अकाउंट जुड़वाएँ।',
  'Sign out': 'साइन आउट', 'Sign out?': 'साइन आउट करें?', 'SIGN OUT': 'साइन आउट', 'Signed in as': 'साइन इन:',
  'You will need internet to sign in again.': 'दोबारा साइन इन के लिए इंटरनेट चाहिए होगा।',
  // bills
  'Active bills': 'चालू बिल', '＋ NEW BILL': '＋ नया बिल', 'No open bills': 'कोई चालू बिल नहीं', '＋ New': '＋ नया',
  'CUSTOMER': 'ग्राहक', 'Change': 'बदलें', 'Regular': 'नियमित', 'One-off': 'एक बार का',
  'No items yet.': 'अभी कोई आइटम नहीं।', 'Tap': 'नीचे', 'below.': 'दबाएँ।',
  'ITEMS': 'सामान', 'ITEMS TOTAL': 'सामान का कुल', 'SCRAP TAKEN (MINUS)': 'स्क्रैप लिया (घटाएँ)', 'SCRAP TOTAL': 'स्क्रैप का कुल',
  'TOTAL': 'कुल', 'AMOUNT TO PAY': 'देने वाली रकम', 'PAY TO CUSTOMER': 'ग्राहक को देना',
  '＋ ADD ITEM': '＋ आइटम जोड़ें', 'CANCEL': 'रद्द', 'SAVE': 'सेव', '✓ COMPLETE': '✓ पूरा करें',
  'ACTIVE': 'चालू', 'DRAFT': 'नया', 'COMPLETED': 'पूरा', 'CANCELLED': 'रद्द',
  'SCRAP': 'स्क्रैप', 'DUE': 'बकाया', 'PAID': 'भुगतान हुआ',
  // customer pick
  'Type or 🎤 speak name': 'नाम लिखें या 🎤 बोलें', 'ONE-OFF CUSTOMER': 'एक बार का ग्राहक', 'REGULAR CUSTOMERS': 'नियमित ग्राहक',
  'One-off — not saved to customers': 'एक बार — ग्राहक सूची में सेव नहीं होगा', 'Add as regular customer': 'नियमित ग्राहक में जोड़ें',
  'No saved customers yet.': 'अभी कोई ग्राहक सेव नहीं।', 'Type or speak a name above.': 'ऊपर नाम लिखें या बोलें।',
  'One-off customer': 'एक बार का ग्राहक', 'Name and phone are optional': 'नाम और फ़ोन ज़रूरी नहीं', 'NAME': 'नाम', 'PHONE': 'फ़ोन',
  'Walk-in customer': 'राह चलता ग्राहक', 'Also save as regular customer': 'नियमित ग्राहक में भी सेव करें', 'CONTINUE ›': 'आगे ›',
  'Speak name': 'नाम बोलें', 'Close': 'बंद करें', 'Back': 'वापस',
  // product picker
  '🔍 Search product…': '🔍 सामान खोजें…', '＋ NEW PRODUCT': '＋ नया सामान', '🎤 SPEAK NEW': '🎤 बोलकर जोड़ें',
  'VIEW BILL ›': 'बिल देखें ›', '⭐ QUICK ITEMS': '⭐ जल्दी वाले', 'WEIGHT BASED': 'वज़न वाले', 'PIECE BASED': 'नग वाले', 'OTHER': 'अन्य',
  'Enter rate': 'रेट डालें', 'Details missing': 'जानकारी अधूरी', 'No products yet. Add them under Products.': 'अभी कोई सामान नहीं। "सामान" में जोड़ें।',
  // qty sheet
  'Rate:': 'रेट:', 'change': 'बदलें', 'For this bill only — catalogue price stays the same.': 'सिर्फ़ इस बिल के लिए — सूची का रेट वही रहेगा।',
  'ADD': 'जोड़ें', 'UPDATE': 'बदलें', 'Remove this item': 'यह आइटम हटाएँ', '⚖ Read from scale': '⚖ कांटे से पढ़ें',
  'Enter weight': 'वज़न डालें', 'Enter quantity': 'मात्रा डालें', 'Enter length': 'लंबाई डालें', 'Enter price': 'रेट डालें',
  // quick add
  'New product': 'नया सामान', 'Only name and price needed. The rest can be filled in later.': 'सिर्फ़ नाम और रेट ज़रूरी है। बाकी बाद में भर सकते हैं।',
  '🎤 SPEAK PRODUCT': '🎤 सामान बोलें', '🎤 SPEAK AGAIN': '🎤 फिर से बोलें', '🎤 Listening… speak now': '🎤 सुन रहा है… बोलिए',
  'Say e.g. “thrust bearing 80 no. 365 rupees”': 'जैसे बोलें: “थ्रस्ट बेयरिंग 80 नग 365 रुपये”', 'Product name': 'सामान का नाम',
  'QUANTITY': 'मात्रा', 'PRICE ₹': 'रेट ₹', 'UNIT': 'यूनिट', 'Not sure': 'पता नहीं', 'Price per unit': 'एक का रेट', 'Total amount': 'कुल रकम',
  '− Scrap / buy-back (deduct from bill)': '− स्क्रैप / वापस खरीद (बिल से घटाएँ)', 'Save this price in the catalogue': 'यह रेट सामान सूची में सेव करें',
  'ADD TO THIS BILL': 'बिल में जोड़ें', 'Already in catalogue?': 'पहले से सूची में है?',
  // complete / payments
  '✓ PAID': '✓ पैसे मिल गए', '✓ PAID OUT': '✓ पैसे दे दिए', 'PAY LATER (DUE)': 'बाद में (बकाया)', 'PAY LATER': 'बाद में', 'BACK': 'वापस',
  'Pay to customer': 'ग्राहक को देना', 'Payments': 'भुगतान', 'No payment yet.': 'अभी कोई भुगतान नहीं।', '✓ Fully settled': '✓ पूरा हिसाब हो गया',
  'Balance due:': 'बकाया:', 'Balance to pay customer:': 'ग्राहक को देना बाकी:', '₹ RECEIVE PAYMENT': '₹ पैसे मिले', 'RECORD PAYOUT': 'पैसे दिए',
  'received': 'मिले', 'paid out': 'दिए', 'Delete payment': 'भुगतान हटाएँ', 'Delete this payment?': 'यह भुगतान हटाएँ?',
  'Receive payment': 'पैसे मिले', 'Record payout': 'पैसे दिए', 'AMOUNT RECEIVED (₹)': 'मिली रकम (₹)', 'AMOUNT PAID OUT (₹)': 'दी गई रकम (₹)',
  'Cash': 'नकद', 'Other': 'अन्य', 'Enter amount': 'रकम डालें', 'Fully settles': 'पूरा हिसाब हो जाएगा', 'Leaves': 'बाकी', 'due': 'बकाया रहेगा',
  'Applied to the oldest unpaid bills first.': 'पहले सबसे पुराने बकाया बिल में जुड़ेगा।', 'SAVE PAYMENT': 'भुगतान सेव करें',
  // receipt screen buttons
  '📤 SHARE': '📤 भेजें', '🖨 PRINT': '🖨 प्रिंट', 'HOME': 'होम',
  // history
  'History': 'पुराने बिल', '🔍 Customer name or bill #': '🔍 ग्राहक का नाम या बिल नंबर', 'Load older bills': 'और पुराने बिल देखें',
  'No matching bills': 'कोई बिल नहीं मिला', 'No completed bills yet': 'अभी कोई पूरा बिल नहीं', 'Loading…': 'लोड हो रहा है…',
  // customers
  'Customers': 'ग्राहक', '＋ Add': '＋ जोड़ें', '🔍 Name or phone': '🔍 नाम या फ़ोन', '＋ ADD CUSTOMER': '＋ ग्राहक जोड़ें',
  'No match': 'कुछ नहीं मिला', 'No customers yet': 'अभी कोई ग्राहक नहीं', 'New customer': 'नया ग्राहक', 'Edit customer': 'ग्राहक बदलें',
  'NAME *': 'नाम *', 'Customer name': 'ग्राहक का नाम', 'ADDRESS': 'पता', 'NOTES': 'नोट', 'CUSTOMER TYPE': 'ग्राहक का प्रकार',
  'SAVE CUSTOMER': 'ग्राहक सेव करें', 'Delete customer': 'ग्राहक हटाएँ',
  'Removed from both phones. Old bills keep the name.': 'दोनों फ़ोन से हट जाएगा। पुराने बिलों में नाम रहेगा।',
  'Save another customer with the same name?': 'इसी नाम से एक और ग्राहक सेव करें?',
  // statement & dues
  'Owes': 'बकाया', 'You owe': 'आपको देना है', '✓ No dues': '✓ कोई बकाया नहीं', 'UNPAID BILLS': 'बकाया बिल', 'BILLS': 'बिल',
  '＋ New bill': '＋ नया बिल', '✎ Edit details': '✎ जानकारी बदलें', 'No bills in this period': 'इस समय में कोई बिल नहीं',
  'Dues': 'बकाया', 'Total due': 'कुल बकाया', '🎉 Nobody owes anything': '🎉 किसी पर कोई बकाया नहीं', 'WE OWE': 'हमें देना',
  // products
  'Products': 'सामान', '🔍 Product or SKU': '🔍 सामान या कोड', 'Tap ★ for quick items. Tap the price to change it.': '★ दबाकर जल्दी वाले में डालें। रेट बदलने के लिए रेट पर दबाएँ।',
  '＋ ADD PRODUCT': '＋ सामान जोड़ें', 'EDIT PRICE': 'रेट बदलें', 'Not set': 'नहीं भरा', 'At billing': 'बिल के समय',
  'All products are complete 🎉': 'सभी सामान की जानकारी पूरी है 🎉', 'Showing only these · tap to show all': 'सिर्फ़ ये दिख रहे हैं · सब देखने के लिए दबाएँ',
  'Added while billing · tap to see them': 'बिल बनाते समय जोड़े गए · देखने के लिए दबाएँ', '⚠ LOW': '⚠ कम', 'Favourite': 'जल्दी वाला',
  'Edit product': 'सामान बदलें', 'PRODUCT NAME *': 'सामान का नाम *', 'e.g. Copper Wire': 'जैसे कॉपर वायर', 'CATEGORY': 'प्रकार',
  'Weight based': 'वज़न वाला', 'Piece based': 'नग वाला', 'Scrap': 'स्क्रैप', 'PRICE TYPE': 'रेट किस पर', 'PRICE': 'रेट',
  'PER KG': 'प्रति kg', 'PER GRAM': 'प्रति ग्राम', 'PER PIECE': 'प्रति नग', 'PER BOX': 'प्रति डिब्बा', 'PER METER': 'प्रति मीटर', 'FIXED': 'फिक्स', '— NOT SET —': '— नहीं भरा —',
  '＋ We sell (adds)': '＋ हम बेचते हैं (जुड़ेगा)', '− Scrap / buy-back (deducts)': '− स्क्रैप / वापस खरीद (घटेगा)',
  'Leave 0 to type the rate at billing time (for "Other" items).': 'बिल बनाते समय रेट डालना हो तो 0 छोड़ दें ("अन्य" सामान के लिए)।',
  'SKU / CODE (optional)': 'कोड (ज़रूरी नहीं)', 'STOCK (optional)': 'स्टॉक (ज़रूरी नहीं)', 'MIN. STOCK': 'कम से कम स्टॉक',
  'Allow decimal quantity (e.g. 2.5)': 'दशमलव मात्रा चलेगी (जैसे 2.5)', '⭐ Quick item (show at top)': '⭐ जल्दी वाला (ऊपर दिखेगा)',
  'Active (show when billing)': 'चालू (बिल में दिखेगा)', 'SAVE PRODUCT': 'सामान सेव करें', 'Delete product': 'सामान हटाएँ',
  'Removed from both phones. Old bills are not affected. Tip: you can mark it Inactive instead.': 'दोनों फ़ोन से हट जाएगा। पुराने बिल नहीं बदलेंगे। चाहें तो इसे "बंद" भी कर सकते हैं।',
  '＋ Sell': '＋ बेचना', '− Scrap / buy-back': '− स्क्रैप / वापस खरीद', 'SAVE PRICE': 'रेट सेव करें', 'Current:': 'अभी:', 'entered at billing': 'बिल के समय डाला जाता है',
  'Updates on both phones. Applies to items added from now on — existing bills keep their price.': 'दोनों फ़ोन पर बदलेगा। अब से जुड़ने वाले आइटम पर लागू — पुराने बिलों का रेट नहीं बदलेगा।',
  // reports
  'Reports': 'रिपोर्ट', '📤 Share': '📤 भेजें', 'Today': 'आज', 'Yesterday': 'कल', 'This week': 'इस हफ़्ते', 'This month': 'इस महीने',
  'Last month': 'पिछले महीने', 'Custom': 'तारीख चुनें', 'FROM': 'से', 'TO': 'तक', 'Summary': 'सारांश',
  'NET SALES': 'कुल बिक्री', 'ITEMS SOLD': 'बिका सामान', 'SCRAP / RETURN': 'स्क्रैप', 'CASH RECEIVED': 'मिले पैसे', 'STILL DUE': 'बाकी बकाया',
  'from these bills': 'इन बिलों से', 'BY DAY': 'दिन के हिसाब से', 'BY MONTH': 'महीने के हिसाब से', 'TOP PRODUCTS': 'सबसे ज़्यादा बिका',
  'TOP CUSTOMERS': 'सबसे बड़े ग्राहक', 'See all': 'सब देखें', 'SOLD': 'बिका', 'SCRAP / BUY-BACK': 'स्क्रैप / वापस खरीद', 'BOUGHT IN': 'खरीदा',
  'No sales in this period': 'इस समय में कोई बिक्री नहीं', 'Not sold in this period': 'इस समय में नहीं बिका', 'BY CUSTOMER': 'ग्राहक के हिसाब से',
  'loading older bills…': 'पुराने बिल लोड हो रहे हैं…',
  // settings
  'Settings': 'सेटिंग', 'Account & sync': 'अकाउंट और सिंक', 'BILL LETTER FOR THIS PHONE': 'इस फ़ोन का बिल अक्षर',
  'Shop': 'दुकान', '(shared by all phones)': '(सभी फ़ोन के लिए)', '(this phone)': '(यह फ़ोन)', 'SHOP NAME': 'दुकान का नाम',
  'ADDRESS (printed on bill)': 'पता (बिल पर छपेगा)', 'PHONE (printed on bill)': 'फ़ोन (बिल पर छपेगा)', 'Show today\'s sales on home screen': 'होम पर आज की बिक्री दिखाएँ',
  'Voice input': 'बोलकर लिखना', 'LANGUAGE': 'भाषा', 'Weighing machine': 'तराज़ू / कांटा', 'Manual entry': 'हाथ से डालें',
  'Type the weight shown on the machine. Bluetooth scale support can be added in a later version.': 'कांटे पर दिखा वज़न डालें। ब्लूटूथ कांटा बाद में जोड़ा जा सकता है।',
  'Backup': 'बैकअप', 'Last backup from this phone:': 'इस फ़ोन से आखिरी बैकअप:', 'Never': 'कभी नहीं',
  'Data is kept in the cloud and on each phone. An extra backup file once a month is still a good idea.': 'डेटा क्लाउड और हर फ़ोन में रहता है। फिर भी महीने में एक बार बैकअप फ़ाइल ले लें।',
  '⬇ EXPORT BACKUP': '⬇ बैकअप निकालें', '⬆ IMPORT BACKUP': '⬆ बैकअप वापस डालें', 'Data': 'डेटा', 'Add sample products': 'नमूना सामान जोड़ें',
  '🗑 CLEAR ALL DATA': '🗑 सारा डेटा मिटाएँ', '🔒 Offline copy on this phone is protected': '🔒 इस फ़ोन की ऑफलाइन कॉपी सुरक्षित है',
  'Install the app to protect the offline copy on this phone': 'ऑफलाइन कॉपी सुरक्षित रखने के लिए ऐप इंस्टॉल करें',
  // dialogs & messages
  'YES': 'हाँ', 'NO': 'नहीं', 'KEEP': 'रखें', 'DELETE': 'हटाएँ', 'REMOVE': 'हटाएँ', 'CANCEL BILL': 'बिल रद्द करें', 'ERASE': 'मिटाएँ', 'RESTORE': 'वापस डालें',
  '✓ Bill saved': '✓ बिल सेव हो गया', '✓ Bill completed': '✓ बिल पूरा हुआ', 'Bill cancelled': 'बिल रद्द हुआ', 'Item removed': 'आइटम हटाया',
  'Add at least one item first': 'पहले कम से कम एक आइटम जोड़ें', 'Enter the rate': 'रेट डालें', 'Enter quantity and price': 'मात्रा और रेट डालें',
  'This bill was closed on another phone': 'यह बिल दूसरे फ़ोन पर बंद हो चुका है', 'This bill was already closed on another phone': 'यह बिल दूसरे फ़ोन पर पहले ही बंद हो चुका है',
  'Customer deleted': 'ग्राहक हटाया', 'Product deleted': 'सामान हटाया', '✓ Customer saved': '✓ ग्राहक सेव हुआ', '✓ Product saved': '✓ सामान सेव हुआ',
  'Enter customer name': 'ग्राहक का नाम डालें', 'Enter product name': 'सामान का नाम डालें', 'Enter a valid price': 'सही रेट डालें',
  'Choose the unit (pcs, kg…)': 'यूनिट चुनें (pcs, kg…)', 'Check the amount': 'रकम जाँचें', 'Nothing due': 'कोई बकाया नहीं',
  'Payment deleted': 'भुगतान हटाया', '✓ Saved': '✓ सेव हुआ', '✓ Saved for all phones': '✓ सभी फ़ोन के लिए सेव हुआ',
  'Choose “Print” in the menu': 'मेन्यू में “Print” चुनें', 'Could not share': 'भेज नहीं पाए', 'Copied — paste it in WhatsApp/SMS': 'कॉपी हो गया — WhatsApp/SMS में पेस्ट करें',
  'Bill image saved — open it to print': 'बिल की फ़ोटो सेव हुई — प्रिंट के लिए खोलें', '🎤 Listening… say the name': '🎤 सुन रहा है… नाम बोलिए',
  'Voice input not available here — please type': 'यहाँ बोलकर लिखना नहीं चलता — टाइप करें',
  'Microphone permission denied — please type the name': 'माइक की अनुमति नहीं — नाम टाइप करें', 'Voice needs internet — please type the name': 'बोलकर लिखने के लिए इंटरनेट चाहिए — नाम टाइप करें',
  'Didn\'t hear a name — try again or type it': 'नाम सुनाई नहीं दिया — फिर बोलें या टाइप करें', 'Voice input failed — please type the name': 'बोलकर लिखना नहीं हुआ — नाम टाइप करें',
  'Microphone permission denied — please type the details': 'माइक की अनुमति नहीं — टाइप करें', 'Voice needs internet — please type the details': 'बोलकर लिखने के लिए इंटरनेट चाहिए — टाइप करें',
  'Voice input failed — please type the details': 'बोलकर लिखना नहीं हुआ — टाइप करें',
  'Needs internet to load older bills': 'पुराने बिल देखने के लिए इंटरनेट चाहिए', 'No older bills': 'और पुराने बिल नहीं',
  // wire bundles
  'WIRE BUNDLES': 'वायर बंडल', 'Give a bundle · bill on return': 'बंडल दें · वापसी पर बिल', 'Wire bundles': 'वायर बंडल',
  '＋ GIVE BUNDLE': '＋ बंडल दें', 'OUT WITH CUSTOMERS': 'ग्राहकों के पास', 'No bundles out': 'कोई बंडल बाहर नहीं', 'RETURNED (RECENT)': 'वापस आए (हाल के)',
  'Give bundle': 'बंडल दें', 'WIRE': 'वायर', 'WEIGHT GIVEN (kg) — as shown on the scale': 'दिया गया वज़न (kg) — कांटे पर जितना दिखे',
  'PACKING': 'पैकिंग', 'BS — with box': 'BS — डिब्बे के साथ', 'Net — wire only': 'Net — सिर्फ़ वायर', 'BOX WEIGHT (kg)': 'डिब्बे का वज़न (kg)',
  'NOTE (optional)': 'नोट (ज़रूरी नहीं)', 'e.g. for motor rewinding': 'जैसे मोटर वाइंडिंग के लिए', 'GIVE BUNDLE': 'बंडल दें',
  'Choose customer': 'ग्राहक चुनें', 'Choose wire': 'वायर चुनें', 'Enter weight': 'वज़न डालें', 'Return bundle': 'बंडल वापसी', 'Bundle': 'बंडल',
  'Wire returned': 'वायर वापस आया', 'Used all': 'पूरा इस्तेमाल', 'WEIGHT RETURNED (kg)': 'वापस आया वज़न (kg)', 'Returned with the box': 'डिब्बे के साथ वापस आया',
  'RATE ₹ / kg': 'रेट ₹ / kg', "ADD TO CUSTOMER'S BILL": 'ग्राहक के बिल में जोड़ें', 'CLOSE BUNDLE (NOTHING USED)': 'बंडल बंद करें (कुछ इस्तेमाल नहीं)',
  'Delete this bundle entry': 'यह बंडल एंट्री हटाएँ', 'Delete this bundle entry?': 'यह बंडल एंट्री हटाएँ?', 'Enter weight returned': 'वापस आया वज़न डालें',
  'Returned more than given — check the weight': 'दिए से ज़्यादा वापस — वज़न जाँचें', 'Return & bill': 'वापसी और बिल', 'WIRE BUNDLES OUT': 'बाहर गए वायर बंडल',
  'Open bill': 'बिल खोलें', 'USED': 'इस्तेमाल', 'DAYS': 'दिन', 'Bundle closed — nothing used': 'बंडल बंद — कुछ इस्तेमाल नहीं', 'Bundle entry deleted': 'बंडल एंट्री हटाई',
  'This bundle was already returned': 'यह बंडल पहले ही वापस आ चुका है', 'Check customer, wire and weight': 'ग्राहक, वायर और वज़न जाँचें',
  'Check the weight and rate': 'वज़न और रेट जाँचें', 'Item removed — bundle is back in the list': 'आइटम हटाया — बंडल फिर से सूची में है',
  'Add wire products (unit KG) under Products first.': 'पहले "सामान" में वायर (यूनिट KG) जोड़ें।', 'BOX / PACKING WEIGHT (kg) — for wire bundles': 'डिब्बे/पैकिंग का वज़न (kg) — वायर बंडल के लिए',
  'Walk-in customer': 'राह चलता ग्राहक',
  'BUNDLE': 'बंडल', 'Tap when wire comes back': 'वायर लौटने पर यहाँ दबाएँ', '🧵 GIVE WIRE BUNDLE (BS / Net)': '🧵 वायर बंडल दें (BS / Net)',
  'Give wire bundle': 'वायर बंडल दें', 'Wire bundle given': 'वायर बंडल दिया', 'Awaiting return': 'वापसी बाकी', 'Not returned': 'वापस नहीं आया',
  'Returned later — billed separately': 'बाद में लौटा — अलग बिल में', '↩ Re-enter returned weight': '↩ वापसी का वज़न फिर से डालें',
  'The bundle is added to this customer\'s open bill as “awaiting return”, so other items can go on the same bill.': 'बंडल ग्राहक के चालू बिल में “वापसी बाकी” के रूप में जुड़ेगा, बाकी सामान भी उसी बिल में जोड़ सकते हैं।',
  'PART PAID — choose items': 'कुछ पैसे मिले — आइटम चुनें', 'WHICH ITEMS ARE PAID NOW? (optional)': 'किन आइटम के पैसे मिले? (ज़रूरी नहीं)',
  'Ticked items show as PAID on the bill; the rest stay DUE.': 'टिक किए आइटम बिल पर "पैसे मिले" दिखेंगे; बाकी बकाया रहेंगे।',
  '🧾 SETTLEMENT BILL': '🧾 हिसाब का बिल', 'Settlement': 'हिसाब', 'Since oldest due': 'सबसे पुराने बकाया से', 'Open': 'खोलें', 'Loading older bills…': 'पुराने बिल लोड हो रहे हैं…',
  '⏳ WAITING FOR WIRE RETURN': '⏳ वायर लौटने का इंतज़ार', 'WIRE OUT': 'वायर बाहर', 'Waiting for wire return': 'वायर लौटने का इंतज़ार', 'Enter return': 'वापसी डालें',
  '⏳ Paid so far — wire used will be added to this bill when the bundle comes back.': '⏳ अभी तक का भुगतान हो गया — बंडल लौटने पर इस्तेमाल हुआ वायर इसी बिल में जुड़ेगा।',
  '🗑 Delete this bill': '🗑 यह बिल हटाएँ', 'Bill deleted': 'बिल हटाया', '🗑 DELETE ALL BILLS (keep products & customers)': '🗑 सभी बिल हटाएँ (सामान और ग्राहक रहेंगे)',
  'Delete ALL bills?': 'सभी बिल हटाएँ?', 'DELETE BILLS': 'बिल हटाएँ', 'Deleting…': 'हटा रहे हैं…', '✓ All bills deleted': '✓ सभी बिल हट गए', 'This bill was cancelled': 'यह बिल रद्द हो चुका है',
  'All bills, payments, dues and wire bundles are erased': 'सभी बिल, भुगतान, बकाया और वायर बंडल मिट जाएँगे',
  'Products, customers and shop settings are kept. Bill numbers start again from 1.': 'सामान, ग्राहक और दुकान की सेटिंग रहेंगी। बिल नंबर फिर 1 से शुरू होंगे।',
  'WIRE SIZE': 'वायर साइज़', 'Other size': 'दूसरा साइज़', 'Choose wire size': 'वायर साइज़ चुनें',
  'Ask wire size when billing (e.g. 1.0, 0.9, 1.3)': 'बिल में वायर साइज़ पूछें (जैसे 1.0, 0.9, 1.3)',
  'SIZE': 'साइज़', 'BRAND': 'ब्रांड / कंपनी', 'MATERIAL': 'मटीरियल', 'Choose size / brand / material': 'साइज़ / ब्रांड / मटीरियल चुनें',
  'NAME ON BILL': 'बिल पर नाम', '✎ EDIT BILL — add items, change customer, qty or rate': '✎ बिल बदलें — आइटम जोड़ें, ग्राहक, मात्रा या रेट बदलें',
  '✎ EDIT': '✎ बदलें', 'This bill is already open': 'यह बिल पहले से खुला है', 'EDIT PRICES': 'रेट बदलें',
  'The bill opens again: change the customer, add items, change quantities or rates. Payments already received are kept. Tap COMPLETE again when done.': 'बिल फिर से खुलेगा: ग्राहक, आइटम, मात्रा या रेट बदलें। मिले हुए पैसे बने रहेंगे। काम होने पर फिर "पूरा करें" दबाएँ।',
  'Comes in different sizes / brands / materials (price for each)': 'अलग-अलग साइज़ / ब्रांड / मटीरियल में आता है (हर एक का अलग रेट)',
  'Sizes · Brands · Materials': 'साइज़ · ब्रांड · मटीरियल', 'One row for each combination with its own price. Leave a box empty if it doesn\'t apply.': 'हर जोड़ी के लिए एक लाइन, अपने रेट के साथ। जो लागू न हो वो खाली छोड़ें।',
  '＋ Add row': '＋ लाइन जोड़ें', '⧉ Copy': '⧉ कॉपी', '✕ Remove': '✕ हटाएँ', 'Size e.g. 2.5 mm': 'साइज़ जैसे 2.5 mm', 'Brand': 'ब्रांड', 'Material': 'मटीरियल', 'Price ₹': 'रेट ₹',
  'Enter a price for every row': 'हर लाइन का रेट डालें', 'Add at least one size / brand / material row': 'कम से कम एक साइज़ / ब्रांड / मटीरियल लाइन जोड़ें',
  'Size': 'साइज़', 'e.g. 2.5 mm': 'जैसे 2.5 mm', 'e.g. Havells': 'जैसे Havells', 'e.g. SS': 'जैसे SS',
  '🧮 QUICK CALCULATOR': '🧮 जल्दी हिसाब (कैलकुलेटर)', 'Quick calculator': 'जल्दी हिसाब', '🧮 Quick calculator': '🧮 जल्दी हिसाब',
  'Start screen': 'शुरू का पेज', 'Home': 'होम', '＋ ADD TO ESTIMATE': '＋ अंदाज़े में जोड़ें', 'Estimate': 'अंदाज़ा (एस्टिमेट)',
  '🧾 MAKE BILL': '🧾 बिल बनाएँ', 'Clear': 'साफ़ करें', 'Clear this estimate?': 'यह अंदाज़ा साफ़ करें?', 'CLEAR': 'साफ़ करें',
  'Tap a product, then type the weight / length / quantity.': 'सामान चुनें, फिर वज़न / लंबाई / मात्रा डालें।', 'Enter the amount and rate': 'मात्रा और रेट डालें',
  '✓ Bill made — choose the customer': '✓ बिल बना — ग्राहक चुनें',
  'By customer': 'ग्राहक के हिसाब से', 'By date': 'तारीख के हिसाब से', 'All': 'सभी', 'No unpaid bills from this period 🎉': 'इस समय का कोई बकाया बिल नहीं 🎉',
  '📝 NOTE ON BILL (optional)': '📝 बिल पर नोट (ज़रूरी नहीं)', 'e.g. 5 HP motor, deliver tomorrow': 'जैसे 5 HP मोटर, कल देना है',
  'English (India)': 'अंग्रेज़ी', 'Hindi': 'हिंदी', 'Marathi': 'मराठी', 'Gujarati': 'गुजराती', 'Punjabi': 'पंजाबी', 'Bengali': 'बांग्ला', 'Tamil': 'तमिल', 'Telugu': 'तेलुगु', 'Kannada': 'कन्नड़',
  'Connect to the internet first': 'पहले इंटरनेट चालू करें', 'Sample products already present': 'नमूना सामान पहले से है', 'All data cleared': 'सारा डेटा मिट गया',
};

// Texts that contain numbers, amounts or names.
const PATTERNS = [
  [/ · oldest today$/, ' · सबसे पुराना आज का'], [/ · oldest yesterday$/, ' · सबसे पुराना कल का'], [/ · oldest (\d+) days ago$/, ' · सबसे पुराना $1 दिन पहले'],
  [/^Today · /, 'आज · '], [/^Yesterday · /, 'कल · '], [/ · total (₹[\d,.]+)/, ' · कुल $1'], [/ · paid (₹[\d,.]+)/, ' · मिले $1'],
  [/^from (\d+) bills? made (.*)$/, (m, n, w) => `${n} बिल से (${({ today: 'आज', yesterday: 'कल', 'this week': 'इस हफ़्ते', 'this month': 'इस महीने' })[w] || w})`],
  [/^(today|yesterday|this week|this month)$/, m => ({ today: 'आज', yesterday: 'कल', 'this week': 'इस हफ़्ते', 'this month': 'इस महीने' })[m]],
  [/^Edit bill (#\S+)\?$/, 'बिल $1 बदलें?'], [/^Paid earlier (₹[\d,.]+) · Balance (-?₹[\d,.]+)$/, 'पहले मिले $1 · बाकी $2'],
  [/^(\d+) options? · /, '$1 विकल्प · '], [/\b(\d+) variants?\b/, '$1 वेरिएंट'],
  [/^Delete bill (#\S+)\?$/, 'बिल $1 हटाएँ?'], [/^⏳ wire out · /, '⏳ वायर बाहर · '], [/ · due (₹.*)$/, ' · बकाया $1'],
  [/^(.*)\. It disappears from history, reports and dues on every phone(.*)\. This can't be undone\.$/, (m, a2, b2) => `${a2}। यह हर फ़ोन पर पुराने बिल, रिपोर्ट और बकाया से हट जाएगा${b2 ? ' (वायर बंडल भी)' : ''}। वापस नहीं आएगा।`],
  [/^⏳ (\d+) wire bundles? not returned yet — the bill stays open.*$/, '⏳ $1 वायर बंडल अभी वापस नहीं आया — बिल खुला रहेगा, लौटने पर इस्तेमाल हुआ वायर इसी बिल में जुड़ेगा।'],
  [/^₹ RECEIVE PAYMENT \((.*)\)$/, '₹ पैसे मिले ($1)'], [/^Open bill (#\S+) not completed$/, 'चालू बिल $1 अभी पूरा नहीं'],
  [/ — complete it to include it here$/, ' — इसे यहाँ जोड़ने के लिए बिल पूरा करें'], [/^for: /, 'इनके लिए: '],
  [/ · box ([\d.,]+)$/, ' · डिब्बा $1'],
  [/^Given (.*) kg BS \(box (.*)\)$/, 'दिया: $1 kg BS (डिब्बा $2)'], [/^Given (.*) kg Net$/, 'दिया: $1 kg Net'],
  [/^Returned (.*) kg with box$/, 'वापस: $1 kg डिब्बे के साथ'], [/^Returned (.*) kg without box$/, 'वापस: $1 kg बिना डिब्बे'],
  [/^Returned ([\d.,]+) kg$/, 'वापस: $1 kg'], [/^Net wire used (.*) kg$/, 'असल इस्तेमाल वायर: $1 kg'],
  [/^✓ Bundle given: (.*)$/, '✓ बंडल दिया: $1'], [/^Open bill (#\S+)$/, 'बिल $1 खोलें'], [/ · goes on this bill, billed when returned$/, ' · इसी बिल में, वापसी पर बिल'],
  [/^⚠ (\d+) wire bundles? not returned yet.*$/, '⚠ $1 वायर बंडल अभी वापस नहीं आया — लौटने पर नए बिल में जुड़ेगा।'],
  [/\b(\d+) unpaid bills?\b/g, '$1 बकाया बिल'], [/\b(\d+) recent bills?\b/g, '$1 हाल के बिल'], [/\b(\d+) older bills?\b/g, '$1 पुराने बिल'],
  [/\b(\d+) items?\b/g, '$1 आइटम'], [/\b(\d+) bills?\b/g, '$1 बिल'], [/\b(\d+) customers?\b/g, '$1 ग्राहक'], [/\b(\d+) products?\b/g, '$1 सामान'],
  [/^(.+) completed$/, '$1 पूरे हुए'], [/ · avg /g, ' · औसत '], [/ · oldest (\d+) days$/, ' · सबसे पुराना $1 दिन'], [/ · oldest /, ' · सबसे पुराना '],
  [/ · total $/, ' · कुल '], [/ · paid$/, ' · पैसे मिल गए'], [/ · Total $/, ' · कुल '], [/ · Regular\b/, ' · नियमित'], [/ · One-off\b/, ' · एक बार का'],
  [/ · due $/, ' · बकाया '], [/ · to pay $/, ' · देना '],
  [/^Bill (#\S+) · Customer$/, 'बिल $1 · ग्राहक'], [/^Bill (#\S+)$/, 'बिल $1'], [/^Add item · /, 'आइटम जोड़ें · '],
  [/^New bill (#\S+)$/, 'नया बिल $1'], [/^Walk-in (#\S+)$/, 'राह चलता ग्राहक $1'], [/^Walk-in customers$/, 'राह चलते ग्राहक'],
  [/^Use “(.*)”$/, '“$1” लें'], [/^＋ Save “(.*)”$/, '＋ “$1” सेव करें'], [/^＋ Add “(.*)” as new product$/, '＋ “$1” नया सामान जोड़ें'],
  [/^No product matches “(.*)”$/, '“$1” नहीं मिला'], [/^＋ Start a bill for (.*)$/, '＋ $1 का नया बिल'],
  [/^Complete bill for (.*)\?$/, '$1 का बिल पूरा करें?'], [/^Cancel bill for (.*)\?$/, '$1 का बिल रद्द करें?'], [/ will be cancelled\.$/, ' रद्द हो जाएगा।'],
  [/^Remove (.*)\?$/, '$1 हटाएँ?'], [/^Delete (.*)\?$/, '$1 हटाएँ?'], [/^“(.*)” already exists$/, '“$1” पहले से है'],
  [/^✓ Added (.*?)  (.*)$/, '✓ जोड़ा: $1  $2'], [/^Updated (.*?)  (.*)$/, 'बदला: $1  $2'], [/ · flagged to complete later$/, ' · बाद में पूरा करें'],
  [/^✓ (.*) received from (.*)$/, '✓ $2 से $1 मिले'], [/^✓ (.*) paid to (.*)$/, '✓ $2 को $1 दिए'],
  [/^⭐ (.*) added to quick items$/, '⭐ $1 जल्दी वाले में जोड़ा'], [/^(.*) removed from quick items$/, '$1 जल्दी वाले से हटाया'],
  [/^Whole numbers only for (.*)$/, '$1 के लिए सिर्फ़ पूरे नंबर'], [/^⚠ (\d+) to check$/, '⚠ $1 जाँचें'],
  [/ needs? details$/, ' की जानकारी अधूरी'], [/^DUE (₹.*)$/, 'बकाया $1'], [/^All dues today: /, 'आज तक कुल बकाया: '], [/ owe money$/, ' पर बकाया'],
  [/^More than /, 'इससे ज़्यादा नहीं: '], [/^Heard: /, 'सुना: '], [/^Stock: /, 'स्टॉक: '], [/ · Stock: /g, ' · स्टॉक: '], [/\bINACTIVE\b/, 'बंद'],
  [/^(Weight based|Piece based|Scrap|Other)( ·|$)/, (m, c, rest) => ({ 'Weight based': 'वज़न वाला', 'Piece based': 'नग वाला', Scrap: 'स्क्रैप', Other: 'अन्य' }[c] + rest)],
  [/^⚠ Missing: (.*)$/, (m, w) => '⚠ कमी: ' + w.replace('unit', 'यूनिट').replace('price', 'रेट')],
  [/^⚠ Details missing: (.*)$/, (m, w) => '⚠ जानकारी अधूरी: ' + w.replace('unit', 'यूनिट').replace('price', 'रेट')],
  [/^Added while billing( by .*)? on (.*)\. Fill in what you know and tap Save\.$/, (m, by, d) => `बिल बनाते समय ${d} को जोड़ा गया${by ? ' (' + by.slice(4) + ')' : ''}। जो पता है भरें और सेव दबाएँ।`],
  [/^⚠ Missing (.*) — it will be flagged.*$/, (m, w) => '⚠ ' + w.replace('unit (pcs / kg…)', 'यूनिट').replace('catalogue price', 'सूची का रेट').replace('name', 'नाम') + ' नहीं भरा — "सामान" में अधूरा दिखेगा, बाद में भरें। बिल पर असर नहीं।'],
  [/^(WEIGHT|QUANTITY|LENGTH) \((.*)\)$/, (m, w, u) => ({ WEIGHT: 'वज़न', QUANTITY: 'मात्रा', LENGTH: 'लंबाई' }[w] + (u ? ` (${u})` : ''))],
  [/^RATE ₹/, 'रेट ₹'], [/ \(deducted from bill\)$/, ' (बिल से घटेगा)'], [/^NEW PRICE ₹/, 'नया रेट ₹'],
  [/^Bills from this phone are numbered (\S+), (\S+) Use a different letter on each phone\.$/, 'इस फ़ोन के बिल $1, $2 नंबर से बनेंगे। हर फ़ोन का अक्षर अलग रखें।'],
  [/^✅ Voice input works in this browser\. (.*)$/, '✅ इस फ़ोन पर बोलकर लिखना चलता है। (इंटरनेट चाहिए)'],
  [/^⚠ This browser has no voice input.*$/, '⚠ इस फ़ोन पर बोलकर लिखना नहीं चलता — टाइप करें।'],
  [/^New bills will be (.*)$/, 'नए बिल: $1'], [/^Added (\d+ .*)$/, 'जोड़े: $1'], [/^✓ (.*): (₹.*) → (₹.*)$/, '✓ $1: $2 → $3'],
  [/^Saved on this phone before sync: (.*)\.$/, 'सिंक से पहले इस फ़ोन में सेव: $1।'],
  [/^(₹[\d,.]+) on (.*)\. The bill will show as due again\.$/, '$2 का $1। बिल फिर से बकाया दिखेगा।'],
  [/\b(\d+) bundles? out with customers$/, '$1 बंडल ग्राहकों के पास'], [/^(.*) bundle out$/, '$1 बंडल बाहर'], [/^Remember this box weight for (.*)$/, '$1 के लिए यह डिब्बे का वज़न याद रखें'],
  [/^ ?BS \(box (.*)\)$/, ' BS (डिब्बा $1)'], [/^(.*) kg − box (.*) kg$/, '$1 kg − डिब्बा $2 kg'],
  [/^Wire given: (.*)$/, 'दिया गया वायर: $1'], [/^Returned (\d.*)$/, 'वापस आया: $1'], [/^Given (.*)$/, 'दिया: $1'], [/ · given /, ' · दिया '],
  [/^✓ Bundle given to (.*): (.*)$/, '✓ $1 को बंडल दिया: $2'], [/^✓ (.*) kg added to bill  (.*)$/, '✓ $1 kg बिल में जोड़ा  $2'],
  [/^Bundle (BS|Net) (.*)$/, (m, k, rest) => `बंडल ${k} ` + rest.replace(/ − box /g, ' − डिब्बा ').replace(/ − returned /g, ' − वापस ').replace(/ kg used$/, ' kg इस्तेमाल')],
  [/^🧵 Bundle (BS|Net) (.*)$/, (m, k, rest) => `🧵 बंडल ${k} ` + rest.replace(/ − box /g, ' − डिब्बा ').replace(/ − returned /g, ' − वापस ').replace(/ kg used$/, ' kg इस्तेमाल')],
  [/^(.*) · (.*) kg\. Use this only if it was entered by mistake\.$/, '$1 · $2 kg। सिर्फ़ गलती से डाली एंट्री के लिए।'],
];

// Names typed by the user are never translated.
const SKIP = 'TEXTAREA, SCRIPT, STYLE, #receipt, [data-raw], .pt-name, .it-name, .bc-name > b, .chip > b, .pr-main > b, .cc-main > b, .h-main > b, .bar-lbl, .brand';
const ATTRS = ['placeholder', 'aria-label', 'title'];

function tr(text) {
  const t = text.trim();
  if (!t) return text;
  if (PHRASES[t]) return text.replace(t, PHRASES[t]);
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}
function translate(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    const v = tr(node.nodeValue);
    if (v !== node.nodeValue) node.nodeValue = v;
  } else if (node.nodeType === Node.ELEMENT_NODE && !node.closest(SKIP)) {
    for (const a of ATTRS) {
      const v = node.getAttribute(a);
      if (v && tr(v) !== v) node.setAttribute(a, tr(v));
    }
    node.childNodes.forEach(translate);
  }
}

export function startHindi() {
  document.documentElement.lang = 'hi';
  translate(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translate);
      else translate(m.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
