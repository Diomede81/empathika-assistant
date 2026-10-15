Put trained wake word models here as `.tflite` files, e.g. `hey_empathika.tflite`.

`hey_max.tflite` (Max's model) is included so a `.env` copied from Max (`WAKEWORD_NAMES=hey_max`) works
unchanged until "Hey Empathika" is trained; then set `WAKEWORD_NAMES=hey_empathika`.
The file name (without `.tflite`) is the name to use in `WAKEWORD_NAMES`.
See [../training/README.md](../training/README.md).
