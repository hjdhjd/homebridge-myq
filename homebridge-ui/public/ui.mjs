/* Copyright(C) 2017-2023, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * ui.mjs: myQ webUI.
 */
"use strict";

import { myQFeatureOptions } from "./myq-featureoptions.mjs";

// Keep a list of all the feature options and option groups.
const featureOptions = new myQFeatureOptions();

// Show the first run user experience if we don't have valid login credentials.
async function showFirstRun () {

  const buttonFirstRun = document.getElementById("firstRun");
  const inputEmail = document.getElementById("email");
  const inputPassword = document.getElementById("password");
  const tdLoginError = document.getElementById("loginError");

  // Pre-populate with anything we might already have in our configuration.
  inputEmail.value = featureOptions.currentConfig[0].email ?? "";
  inputPassword.value = featureOptions.currentConfig[0].password ?? "";

  // Clear login error messages when the login credentials change.
  inputEmail.addEventListener("input", () => {

    tdLoginError.innerHTML = "&nbsp;";
  });

  inputPassword.addEventListener("input", () => {

    tdLoginError.innerHTML = "&nbsp;";
  });

  // First run user experience.
  buttonFirstRun.addEventListener("click", async () => {

    // Show the beachball while we setup.
    homebridge.showSpinner();

    const email = inputEmail.value;
    const password = inputPassword.value;

    tdLoginError.innerHTML = "&nbsp;";

    if(!email?.length || !password?.length) {

      tdLoginError.appendChild(document.createTextNode("You haven't entered a valid email address and password."));
      homebridge.hideSpinner();
      return;
    }

    const myQDevices = await homebridge.request("/getDevices", { email: email, password: password });

    // Couldn't connect to the myQ API for some reason.
    if((myQDevices?.length === 1) && myQDevices[0] === -1) {

      tdLoginError.appendChild(document.createTextNode("Unable to login to the myQ API. Please check your email address and password."));
      homebridge.hideSpinner();
      return;
    }

    // Save the email and password in our configuration.
    featureOptions.currentConfig[0].email = email;
    featureOptions.currentConfig[0].password = password;
    await homebridge.updatePluginConfig(featureOptions.currentConfig);

    // Create our UI.
    document.getElementById("pageFirstRun").style.display = "none";
    document.getElementById("menuWrapper").style.display = "inline-flex";
    featureOptions.showUI();

    // All done. Let the user interact with us, although in practice, we shouldn't get here.
    // homebridge.hideSpinner();
  });

  document.getElementById("pageFirstRun").style.display = "block";
}

// Show the main plugin configuration tab.
function showSettings () {

  // Show the beachball while we setup.
  homebridge.showSpinner();

  // Create our UI.
  document.getElementById("menuHome").classList.remove("btn-elegant");
  document.getElementById("menuHome").classList.add("btn-primary");
  document.getElementById("menuFeatureOptions").classList.remove("btn-elegant");
  document.getElementById("menuFeatureOptions").classList.add("btn-primary");
  document.getElementById("menuSettings").classList.add("btn-elegant");
  document.getElementById("menuSettings").classList.remove("btn-primary");

  document.getElementById("pageSupport").style.display = "none";
  document.getElementById("pageFeatureOptions").style.display = "none";

  homebridge.showSchemaForm();

  // All done. Let the user interact with us.
  homebridge.hideSpinner();
}

// Show the support tab.
function showSupport() {

  // Show the beachball while we setup.
  homebridge.showSpinner();
  homebridge.hideSchemaForm();

  // Create our UI.
  document.getElementById("menuHome").classList.add("btn-elegant");
  document.getElementById("menuHome").classList.remove("btn-primary");
  document.getElementById("menuFeatureOptions").classList.remove("btn-elegant");
  document.getElementById("menuFeatureOptions").classList.add("btn-primary");
  document.getElementById("menuSettings").classList.remove("btn-elegant");
  document.getElementById("menuSettings").classList.add("btn-primary");

  document.getElementById("pageSupport").style.display = "block";
  document.getElementById("pageFeatureOptions").style.display = "none";

  // All done. Let the user interact with us.
  homebridge.hideSpinner();
}

// Launch our webUI.
async function launchWebUI() {

  // Retrieve the current plugin configuration.
  featureOptions.currentConfig = await homebridge.getPluginConfig();

  // Add our event listeners to animate the UI.
  menuHome.addEventListener("click", () => showSupport());
  menuFeatureOptions.addEventListener("click", () => featureOptions.showUI());
  menuSettings.addEventListener("click", () => showSettings());

  // If we've got a valid myQ email address and password configured, we launch our feature option UI. Otherwise, we launch our first run UI.
  if(featureOptions.currentConfig.length && featureOptions.currentConfig[0]?.email?.length && featureOptions.currentConfig[0]?.password?.length) {

    document.getElementById("menuWrapper").style.display = "inline-flex";
    featureOptions.showUI();
    return;
  }

  // If we have no configuration, let's create one.
  if(!featureOptions.currentConfig.length) {

    featureOptions.currentConfig.push({ name: "myQ" });
  } else if(!("name" in featureOptions.currentConfig[0])) {

    // If we haven't set the name, let's do so now.
    featureOptions.currentConfig[0].name = "myQ";
  }

  // Update the plugin configuration and launch the first run UI.
  await homebridge.updatePluginConfig(featureOptions.currentConfig);
  showFirstRun();
}

// Fire off our UI, catching errors along the way.
try {

  launchWebUI();
} catch(err) {

  // If we had an error instantiating or updating the UI, notify the user.
  homebridge.toast.error(err.message, "Error");
} finally {

  // Always leave the UI in a usable place for the end user.
  homebridge.hideSpinner();
}
