import Phaser from "phaser";
import Constants from "../constants";
export default class Welcome extends Phaser.Scene {

    /*
    Register allowed keys
    */
  init() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const characters = letters + letters.toLowerCase() + numbers;

    const keys = characters.split("").join(",");
    console.log(keys);
    this.keys = this.input.keyboard.addKeys(keys);

    this.backspace = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.BACKSPACE
    );
    this.enter = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER
    );

  }


    /*
    Render text
    */
  create() {
    this.welcome_text = `Welcome, enter your name\n\n`;
    this.text = this.add.text(Constants.WIDTH/2, Constants.HEIGHT/2, this.welcome_text, {
      color: "#00ff00",
      align: "center",
      fontSize: "30px",
    });
    this.text.setOrigin(0.5);
    this.name = "";

    // Create a keyboard input
    this.input.keyboard.on('keydown', (event) => {
        // Check if the key is a letter or backspace
        if (event.key.length === 1 || event.key === 'Backspace') {
            if (event.key === 'Backspace') {
                this.name = this.name.slice(0, -1);
            } else {
                this.name += event.key;
            }

            // Update the display text
            this.text.setText(this.name);
        }
    });
  }

    /*
    Poll for keyboard keys to display name, and for enter to go to game scene.
    */
  update() {
    if (Phaser.Input.Keyboard.JustDown(this.enter)) {
      this.scene.start("playgame", this.name);
    }
    this.text.setText(this.welcome_text + this.name);
    console.log("v6");
  }
}
