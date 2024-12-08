import Phaser from "phaser";
import Coin from "../assets/coin.svg";
import blue_orb from "../assets/blue_orb.png";
import red_orb from "../assets/red_orb.png";
import Spaceship from "../assets/spaceship.svg";
import BulletIcon from "../assets/bullet.svg";
import Bullets from "./Bullets";
import Explosion from "../assets/explosion.png";
import ExplosionSound from "../assets/exp.m4a";
import ShotSound from "../assets/shot.mp3";
import CoinSound from "../assets/coin_collect.wav";
import Constants from "../constants";
import io from "socket.io-client";
class PlayGame extends Phaser.Scene {

  /* Initialize client connection to socket server*/
  init(name) {
    console.log("NODE_ENV", process.env.NODE_ENV);
    console.log("version 11/11 16:49");
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      this.ENDPOINT = "localhost:3000/";
      console.log("in development mode");
    } else {
      this.ENDPOINT = "https://nsf-game.onrender.com/";
      console.log("in deployment mode");
    }
    console.log(this.ENDPOINT);
    this.name = name;
    this.keys = this.input.keyboard.createCursorKeys();
    this.space = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );
    this.score = 0;
    this.others = {}; //to store other players
    this.x = Phaser.Math.Between(50, Constants.WIDTH - 50); // random initial x,y coordinates
    this.y = Phaser.Math.Between(50, Constants.HEIGHT - 50);
    this.speed = 0;
    this.reload = Constants.RELOAD;
    this.max_speed = Constants.MAX_SPEED;
    this.acceleration = Constants.ACCELERATION;
    this.last_fire = 0;
    this.num_fire = 1;
    this.turn_speed = Constants.TURN_SPEED;
  }

  /* Load assets */
  preload() {
    this.load.spritesheet("boom", Explosion, {
      frameWidth: 64,
      frameHeight: 64,
      endFrame: 23,
    });
    this.load.image("coin", Coin);
    this.load.image("blue_orb", blue_orb);
    this.load.image("red_orb", red_orb);
    this.load.image("ship", Spaceship);
    this.load.image("bullet", BulletIcon);
    this.load.audio("explosion", ExplosionSound);
    this.load.audio("shot", ShotSound);
    this.load.audio("coin", CoinSound);
  }


  create() {
    /* Create sounds and animations */
    var config = {
      key: "explode",
      frames: this.anims.generateFrameNumbers("boom", {
        start: 0,
        end: 23,
        first: 23,
      }),
      frameRate: 50,
    };
    this.explosion_sound = this.sound.add("explosion");
    this.shot_sound = this.sound.add("shot");
    this.coin_sound = this.sound.add("coin");
    this.anims.create(config);

    // Render client spaceship
    this.ship = this.get_new_spaceship(
      this.x,
      this.y,
      this.score,
      this.name,
      0
    );
    // Enable collision with world bounds
    // Listen for collisions with world bounds
    this.physics.world.on('worldbounds', (body) => {
      //if (body.gameObject === this.ship) {
          console.log('ship hit the boundary!');
          this.animate_explosion("0");
      // }
  });


    this.socket = io(this.ENDPOINT); //connect to server.
    // Create bullet sprite-group
    this.bullets = new Bullets(this);

    /*
    This is recieved once for each new user, the user gets their id,
    and a map of all other user objects.
    */
    this.socket.on("to_new_user", (params, callback) => {
      this.id = params.id;
      this.others = params.others;
      /*
      Render the spaceships of all other users, and coin object.
      */
      for (const key of Object.keys(this.others)) {
        const x = this.others[key].x;
        const y = this.others[key].y;
        const score = this.others[key].score;
        const name = this.others[key].name;
        const angle = this.others[key].angle;
        const bullets = this.others[key].bullets;
        this.others[key].ship = this.get_new_spaceship(
          x,
          y,
          score,
          name,
          angle
        );
        this.others[key].bullets = this.get_enemy_bullets(bullets, key);
        this.others[key].score = score;
        this.others[key].name = name;
        this.check_for_winner(score);
      }
      this.coin = this.get_coin(params.coin.x, params.coin.y);
      this.blue_orb = this.get_item("blue_orb", params.blue_orb.x, params.blue_orb.y);
      this.red_orb = this.get_item("red_orb", params.red_orb.x, params.red_orb.y);
      /*
      Update server with coordinates.
      */
      this.emit_coordinates();
    });

    /*
    Listen to server for updates on other users.
    */
    this.socket.on("to_others", (params, callback) => {
      const other_id = params.id;
      const other_x = params.x;
      const other_y = params.y;
      const score = params.score;
      const name = params.name;
      const angle = params.angle;
      const bullets = params.bullets;
      /*
      Either it's a new client, or an existing one with new info.
      */
      if (!(other_id in this.others)) {
        var ship = this.get_new_spaceship(other_x, other_y, score, name, angle);
        var others_bullets = this.get_enemy_bullets(bullets, other_id);
        this.others[other_id] = {
          x: other_x,
          y: other_y,
          ship: ship,
          bullets: others_bullets,
          score: score,
          name: name,
        };
      } else {
        this.others[other_id].ship.cont.x = other_x;
        this.others[other_id].ship.cont.y = other_y;
        this.others[other_id].ship.score_text.setText(`${name}: ${score}`);
        this.others[other_id].ship.ship.setAngle(angle);
        this.update_enemy_bullets(other_id, bullets);
        this.others[other_id].score = score;
        this.others[other_id].name = name;
      }
      this.check_for_winner(score);
    });

    /*
    Listen for changes in the coordinates of the coin.
    */
    this.socket.on("coin_changed", (params, callback) => {
      this.coin_sound.play();
      this.coin.x = params.coin.x;
      this.coin.y = params.coin.y;
    });

    this.socket.on("item_changed", (params, callback) => {
      this.change_item(params.item.item_name, "x", params.item.x);
      this.change_item(params.item.item_name, "y", params.item.y);
    });

    /*
    Listen for other players being shot, to animate an explosion on their spaceship sprite.
    */
    this.socket.on("other_collision", (params, callback) => {
      const other_id = params.bullet_user_id;
      const bullet_index = params.bullet_index;
      const exploded_user_id = params.exploded_user_id;
      this.bullets.children.entries[bullet_index].setVisible(false);
      this.bullets.children.entries[bullet_index].setActive(false);
      this.animate_explosion(exploded_user_id);
    });

    /*
    Play a shot sound whenever another player shoots a bullet.
    */
    this.socket.on("other_shot", (p, c) => this.shot_sound.play());

    /*
    Listen for disconnections of others.
    */
    this.socket.on("user_disconnected", (params, callback) => {
      this.others[params.id].ship.score_text.destroy();
      this.others[params.id].ship.ship.destroy();
      this.others[params.id].ship.cont.destroy();
      delete this.others[params.id];
    });
  }

  /*
  Poll for arrow keys to move the spaceship.
  */
  update() {
    const cont = this.ship.cont;
    const ship = this.ship.ship;
    const fps = this.game.loop.actualFps;
    var keys_down = "";
    console.log(cont.x, cont.y);
    if (this.keys.up.isDown && cont.active) {
      this.speed += this.acceleration*60/fps;
      if (this.speed > this.max_speed) {
        this.speed = this.max_speed;
      }
      cont.x += this.speed * Math.sin(ship.angle * Math.PI / 180)*60/fps;
      cont.y -= this.speed * Math.cos(ship.angle * Math.PI / 180)*60/fps;
      keys_down += "u";
    }
    else if (this.keys.down.isDown && cont.active) {
      this.speed -= this.acceleration*60/fps;
      if (this.speed < -this.max_speed/3) {
        this.speed = -this.max_speed/3;
      }
      cont.x += this.speed * Math.sin(ship.angle * Math.PI / 180)*60/fps;
      cont.y -= this.speed * Math.cos(ship.angle * Math.PI / 180)*60/fps;
      keys_down += "u";
    }
    else {
      if (this.speed > 0) {
        this.speed -= this.acceleration*3/4*60/fps;
        if (this.speed < 0) {
          this.speed = 0;
        }
      }
      else if (this.speed < 0) {
        this.speed += this.acceleration*3/4*60/fps;
        if (this.speed > 0) {
          this.speed = 0;
        }
      }
      cont.x += this.speed * Math.sin(ship.angle * Math.PI / 180)*60/fps;
      cont.y -= this.speed * Math.cos(ship.angle * Math.PI / 180)*60/fps;
      
    }
    if (this.keys.right.isDown && cont.active) {
      ship.setAngle(ship.angle + 2);
      keys_down += "r"
    }
    if (this.keys.left.isDown && cont.active) {
      ship.setAngle(ship.angle - 2);
      keys_down += "l"
    }
    const keys_angle = {
      l: -1,
      r: 1,
      ur: 1,
      ul: -1,
    };
    if (this.keys.space.isDown && cont.active) {
      console.log(this.last_fire);
      if (this.last_fire < (Date.now() - this.reload)) {
        this.last_fire = Date.now()
        this.bullets.fireBullet(
          this.ship.cont.x,
          this.ship.cont.y - 5,
          this.ship.ship.angle,
          () => {
            this.socket.emit("shot");
            this.shot_sound.play();
          }
        );
        for (let i = 1; i <= this.num_fire-1; i++) {
          this.bullets.fireBullet(
            this.ship.cont.x,
            this.ship.cont.y - 5,
            this.ship.ship.angle+10*i,
            () => {
              this.socket.emit("shot");
              this.shot_sound.play();
            }
          );
          this.bullets.fireBullet(
            this.ship.cont.x,
            this.ship.cont.y - 5,
            this.ship.ship.angle-10*i,
            () => {
              this.socket.emit("shot");
              this.shot_sound.play();
            }
          );
        }
      }
    }
    this.emit_coordinates();
  }

  /*
  Get a new game object consisting of:
  spaceship sprite, name and score.
  */
  get_new_spaceship = (x, y, score, name, angle) => {
    var score_text = this.add.text(-30, 25, `${name}: ${score}`, {
      color: "#00ff00",
      align: "center",
      fontSize: "13px",
    });
    var ship = this.add.sprite(0, 0, "ship");
    ship.setAngle(0);
    var cont = this.add.container(x, y, [ship, score_text]);
    cont.setSize(45, 45);
    this.physics.add.existing(cont, false);
    this.physics.add.existing(ship, false);
    cont.body.setCollideWorldBounds(true);
    cont.body.onWorldBounds = true; // Enable world bounds event

    return { score_text, ship, cont };
  };

  /*
  Upon movement, inform the server of new coordinates.
  */
  emit_coordinates = () => {
    this.socket.emit("update_coordinates", {
      x: this.ship.cont.x,
      y: this.ship.cont.y,
      score: this.score,
      name: this.name,
      angle: this.ship.ship.angle,
      bullets: this.bullets.get_all_bullets(this.socket.id),
    });
  };

  /*
  Create coin object , and initiate a collider between the coin
  and the clients ship.
  */
  get_coin = (x, y) => {
    var coin = this.add.sprite(x, y, "coin");
    this.physics.add.existing(coin, false);
    this.physics.add.collider(coin, this.ship.ship, this.fire, null, this);
    return coin;
  };

  get_item = (item_name, x, y) => {
    var item = this.add.sprite(x, y, item_name);
    this.physics.add.existing(item, false);
    console.log(item_name);
    this.physics.add.collider(item, this.ship.ship, () => this.collectItem(item, item_name), null, this);
    return item;
  };
  change_item = (item_name, part, val) => {
    if (item_name == "blue_orb") {
      if (part == "x") {
        this.blue_orb.x = val;
      }
      else {
        this.blue_orb.y = val;
      }
    }
    else if (item_name == "red_orb") {
      if (part == "x") {
        this.red_orb.x = val;
      }
      else {
        this.red_orb.y = val;
      }
    }
  }

  /*
  When a player overlaps with the coin,
  the others are notified of its new position
  by this callback.
  */
  fire = (coin) => {
    this.coin_sound.play();
    coin.x = Phaser.Math.Between(20, Constants.WIDTH - 20);
    coin.y = Phaser.Math.Between(20, Constants.HEIGHT - 20);
    this.score += 5;
    this.ship.score_text.setText(`${this.name}: ${this.score}`);
    this.socket.emit("update_coin", {
      x: coin.x,
      y: coin.y,
    });
    this.check_for_winner(this.score);
  };

  collectItem = (item, item_name) => {
    // Check if item exists
    if (!item) {
      console.error("Item is not valid");
      return; // Exit if item is invalid
    }
  
    // Check for a cooldown to prevent multiple item collections from firing too quickly
    if (this.itemCollectCooldown) {
      console.log("Cooldown active. Please wait...");
      return;
    }
    this.itemCollectCooldown = true;
  
    // Update the score text for the player
    this.ship.score_text.setText(`${this.name}: ${this.score}`);
  
    // Modify stats based on the item collected
    if (item_name === "blue_orb") {
      this.max_speed += 0.25;
      this.acceleration += 0.005;
    } else if (item_name === "red_orb") {
      this.num_fire += 0.25;
      this.reload -= 5;
    }
  
    // Play the coin sound immediately
    this.coin_sound.play();
  
    // Hide the item for 3 seconds
    item.setVisible(false);
  
    // Use setTimeout to delay the item's movement for 3 seconds
    setTimeout(() => {
      // Ensure item and socket are still valid after delay
      if (item && this.socket && this.socket.connected) {
        // Move the item to a new random position
        item.x = Phaser.Math.Between(20, Constants.WIDTH - 20);
        item.y = Phaser.Math.Between(20, Constants.HEIGHT - 20);
  
        // Emit the updated item position to the server
        this.socket.emit("update_item", {
          item_name: item_name,
          x: item.x,
          y: item.y,
        });
  
        console.log(`Item ${item_name} moved to new position: x=${item.x}, y=${item.y}`);
  
        // Make the item visible again
        item.setVisible(true);
      } else {
        console.warn("Item or socket is not valid.");
      }
  
      // End the cooldown after the item has moved
      this.itemCollectCooldown = false;
    }, 3000); // Delay of 3 seconds
  
    // Check if there is a winner
    this.check_for_winner(this.score);
  };
  

  /*
  Create bullet objects for enemies (for new enemies or new clients), then create a collider callback
  in case any of the bullets ever hits the client.
  */
  get_enemy_bullets = (bullets, id) => {
    var enemy_bullets = new Bullets(this);
    for (let i = 0; i < bullets.length; i++) {
      enemy_bullets.children.entries[i].setAngle(bullets[i].angle);
      enemy_bullets.children.entries[i].setActive(bullets[i].active);
      enemy_bullets.children.entries[i].setVisible(bullets[i].visible);
      enemy_bullets.children.entries[i].x = bullets[i].x;
      enemy_bullets.children.entries[i].y = bullets[i].y;
      this.physics.add.collider(
        enemy_bullets.children.entries[i],
        this.ship.ship,
        (bullet) => {
          if (!bullet.disabled) {
            this.emmit_collision(id, i);
            bullet.disabled = true;
            enemy_bullets.children.entries[i].setActive(false);
            this.animate_explosion("0");
          } else {
            setTimeout(() => {
              bullet.disabled = false;
            }, 100);
          }
        },
        null,
        this
      );
    }
    return enemy_bullets;
  };

  /*
  Update all the sprites of the enemy bullets based on enemy updates read by socket.
  */
  update_enemy_bullets = (id, bullets) => {
    var bullet_sprites = this.others[id].bullets;
    for (var i = 0; i < bullets.length; i++) {
      bullet_sprites.children.entries[i].x = bullets[i].x;
      bullet_sprites.children.entries[i].y = bullets[i].y;
      bullet_sprites.children.entries[i].setAngle(bullets[i].angle);
      bullet_sprites.children.entries[i].setActive(bullets[i].active);
      bullet_sprites.children.entries[i].setVisible(bullets[i].visible);
    }
  };

  /*
  The client here emits to all the other players that they have been hit by a bullet.
  */
  emmit_collision = (bullet_user_id, bullet_index) => {
    this.socket.emit("collision", { bullet_user_id, bullet_index });
  };

  /*
  Animate the explosion of the player that got hit (checks if player is the client or another).
  The player that gets shot is disabled for 1 sec.
  */
  animate_explosion = (id) => {
    var ship;
    if (id === "0") {
      ship = this.ship.cont;
      var boom = this.add.sprite(ship.x, ship.y, "boom");
      boom.anims.play("explode");
      this.explosion_sound.play();
      ship.setActive(false);
      this.score = Math.max(0, this.score - 2);
      this.ship.score_text.setText(`${this.name}: ${this.score}`);
      ship.x = Phaser.Math.Between(50, Constants.WIDTH - 50);
      ship.y = Phaser.Math.Between(50, Constants.HEIGHT - 50);
      setTimeout(() => {
        ship.setActive(true);
      }, 1000);
    } else {
      ship = this.others[id].ship.cont;
      var boom = this.add.sprite(ship.x, ship.y, "boom");
      boom.anims.play("explode");
      this.explosion_sound.play();
    }
  };

  /*
  If any player exceeds 100 points , the game is over and the scoreboard is shown.
  */
  check_for_winner = (score) => {
    if (score >= Constants.POINTS_TO_WIN) {
      let players = [{ name: this.name, score: this.score }];
      for (let other in this.others) {
        players.push({
          name: this.others[other].name,
          score: this.others[other].score,
        });
      }
      players = players.sort((a, b) => b.score - a.score);
      setTimeout(() => this.socket.disconnect(), 20);
      this.scene.start("winner", players);
    }
  };
}

export default PlayGame;
