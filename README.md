# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Email a local monthly report

In the Expenses tab, select a month and year, tap **Email Report**, and enter
one recipient address. The app reads that month's local expenses and fuel logs,
generates the existing PDF report, and opens an email draft with the PDF attached.
Review the draft and tap **Send** in your email app.

- Requires `expo-mail-composer` and a configured email app on Android or iOS.
  Rebuild an existing native development/production app after installing it.
- No MongoDB, Resend account, API key, or backend is needed for this action.
- Generating a draft does not require server sync. Your email provider needs
  connectivity to deliver it; the email app may queue outgoing mail offline.
- Income is not included. The report contains unmasked financial details;
  verify the recipient and attachment before sending.
- The app does not claim delivery, because opening/closing a composer cannot
  reliably confirm it. Canceling the draft sends nothing through this app.
- On web, the same button downloads a PDF using `jspdf`, then displays an
  **Open Email Draft** link with the recipient and summary. Attach the downloaded
  PDF manually. A configured browser/OS email handler is required to open the
  draft; otherwise compose in your webmail. No email is sent automatically.
- The browser PDF uses built-in fonts, which may not render all non-Latin
  transaction text. Native PDF generation remains unchanged.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.


to install or create .apk 

npm install  eas-cli
eas login
// Enter email and pass
eas build:configure
eas init --id {if have id then else create by expo}


- "main": "expo-router/entry",