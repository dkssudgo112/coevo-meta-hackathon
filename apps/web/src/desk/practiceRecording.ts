// Reviewed recorded output from one live sample. No account or workspace data.
import type { RecordedPractice } from './practicePreview.ts';

export const PRACTICE_RECORDING = {
  "recordedOn": "2026-10-31",
  "scenario": "Maya asks you to make a window poster for the new peppermint mocha.",
  "scene": {
    "setting": "cafe",
    "speaker": {
      "name": "Maya",
      "role": "co-owner"
    },
    "lines": [
      "Can you draw up a window poster for our new peppermint mocha?",
      "We get the morning commuter rush and I want them to stop for something warm.",
      "You have that phone photo of the cup on our counter, right? Use that."
    ],
    "changed": "New winter peppermint mocha instead of our usual lattes",
    "facts": {
      "audience": {
        "text": "Morning commuters passing our cafe on weekdays",
        "stake": "If we don't say it's for them, I'll lose our morning rush."
      },
      "price": {
        "text": "$4.50 small, $5.25 large this winter",
        "stake": "If we leave off the price, I'll get questions at our register all day."
      },
      "mood": {
        "text": "Cold wet morning, warm cup in hands by our window",
        "stake": "If it doesn't feel warm, I won't get our customers to stop."
      },
      "realPhoto": {
        "text": "You have a phone photo of the cup on the counter",
        "stake": "If we don't use your shot, our poster won't look like us."
      },
      "productDetail": {
        "text": "Peppermint mocha with cocoa and crushed mint topping",
        "stake": "If we skip the mint topping, our drink looks like we sell anything."
      }
    },
    "hasRealPhoto": true
  },
  "inputOrigin": "scripted",
  "outputOrigin": "live-model",
  "recordedJudgment": {
    "verdict": "fix",
    "fix": "price"
  },
  "first": {
    "brief": "A window poster for our new peppermint mocha with cocoa and crushed mint on top. It's for morning commuters walking past on weekdays: a cold, wet morning and a warm cup in your hands.",
    "ingredients": {
      "audience": true,
      "price": false,
      "mood": true,
      "realPhoto": false,
      "productDetail": true
    },
    "checkNote": "You need to add a concrete price for the peppermint mocha.",
    "reading": {
      "items": {
        "audience": {
          "status": "unclear",
          "evidence": "Text says WEEKDAY MORNINGS, no commuters named."
        },
        "price": {
          "status": "missing",
          "evidence": "No dollar amounts or prices appear."
        },
        "mood": {
          "status": "shown",
          "evidence": "Rainy street, steaming cup in hand, text WARM CUP. COLD MORNING."
        },
        "realPhoto": {
          "status": "unclear",
          "evidence": "No photo was given to compare with."
        },
        "productDetail": {
          "status": "shown",
          "evidence": "Text PEPPERMINT MOCHA COCOA & CRUSHED MINT, topped cup."
        }
      },
      "note": "You show the drink and morning mood but the $4.50 and $5.25 prices are missing.",
      "provenance": "live-model"
    },
    "assistance": "independent",
    "image": "/samples/practice/first.jpg"
  },
  "revision": {
    "brief": "Window poster for our new peppermint mocha with cocoa and crushed mint on top, for weekday morning commuters walking past our cafe. Show the prices large and clear: $4.50 small, $5.25 large. A cold, wet morning and a warm cup in your hands. Leave a space for my own photo of the cup.",
    "ingredients": {
      "audience": true,
      "price": true,
      "mood": true,
      "realPhoto": true,
      "productDetail": true
    },
    "checkNote": "You included audience, price, mood, product detail, and space for your photo.",
    "reading": {
      "items": {
        "audience": {
          "status": "shown",
          "evidence": "Text 'FOR WEEKDAY MORNING COMMUTERS' at bottom"
        },
        "price": {
          "status": "shown",
          "evidence": "Large text '$4.50 SMALL' and '$5.25 LARGE'"
        },
        "mood": {
          "status": "shown",
          "evidence": "Rainy window background and 'WARM CUP IN YOUR HANDS'"
        },
        "realPhoto": {
          "status": "unclear",
          "evidence": "No photo was given to compare with."
        },
        "productDetail": {
          "status": "shown",
          "evidence": "Text 'PEPPERMINT MOCHA WITH COCOA & CRUSHED MINT ON TOP'"
        }
      },
      "note": "You still need to replace the placeholder box with your phone photo of the cup.",
      "provenance": "live-model"
    },
    "assistance": "coached",
    "image": "/samples/practice/revised.jpg"
  }
} satisfies RecordedPractice;
