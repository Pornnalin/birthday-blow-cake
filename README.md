# Birthday Blow

A tiny playful web project made to celebrate my own birthday.

The player opens the camera and blows out a virtual candle with their mouth. The cake runs around the screen first, then comes back for the final blow. When the candle is blown out, the page shows a birthday message with music and confetti.

## Features

- Front camera face and mouth tracking
- MediaPipe Face Landmarker for tracking
- Party hat that follows the player's head
- Cake movement sequence: left, right, left, top, bottom
- Blow detection from mouth shape, without using the microphone
- Birthday music and celebration effects after a successful blow
- Debug mode for tuning positions and mouth values

## Run Locally

Open the project through `localhost`, because browsers require a secure context for camera access.

```bash
python3 -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

## Debug

The normal page does not show debug overlays.

Enable debug:

```text
http://127.0.0.1:8000/?debug
```

Enable debug and prevent auto-finish while tuning mouth values:

```text
http://127.0.0.1:8000/?debug&tune=1
```

## Files

- `index.html` page structure
- `styles.css` visuals, animation, cake, hat, message, and confetti
- `app.js` camera tracking, game sequence, music, and blow logic

## Note

This project is just for fun. It is not meant to be a serious production app or support every device perfectly.
