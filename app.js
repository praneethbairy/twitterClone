const express = require("express");
const path = require("path");

const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const convertEachUserObjectToResponseObject = (userObject) => {
  return {
    username: userObject.username,
    tweet: userObject.tweet,
    dateTime: userObject.dateTime,
  };
};

const convertUserFollowerObjectToResponseObject = (object) => {
  return {
    name: object.name,
  };
};

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

const validatePassword = (password) => {
  return password.length > 6;
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const checkUser = `select * from user where username = '${username}';`;
  const dbUser = await db.get(checkUser);

  if (dbUser === undefined) {
    const createUserQuery = `
      insert into 
      user 
        (name,username,password,gender)
      values
        ('${name}','${username}','${hashedPassword}','${gender}')`;

    if (validatePassword(password)) {
      await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const loginUserQuery = `select * from user where username = "${username}";`;
  const dbUser = await db.get(loginUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payLoad = { username: username };
      const jwtToken = jwt.sign(payLoad, "MY_SECRET_TOKEN");
      if (jwtToken === undefined) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        response.send({ jwtToken });
      }
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// Returns the latest tweets of people whom the user follows

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const userTweetsQuery = `
    select 
        user.username ,
        tweet.tweet,
        tweet.date_time as dateTime
    from 
        (user inner join tweet on user.user_id = tweet.user_id) as t inner join follower on t.user_id = follower.following_user_id
    order by 
        tweet.date_time desc
    limit
        4
    ;`;

    const dbUser = await db.all(userTweetsQuery);

    response.send(
      dbUser.map((object) => convertEachUserObjectToResponseObject(object))
    );
  }
);

// Returns the list of all names of people whom the user follows

app.get("/user/following/", authenticationToken, async (request, response) => {
  const userFollowingQuery = `
    select 
        user.name
    from 
        (user inner join follower on user.user_id = follower.follower_user_id);
    `;

  const dbUser = await db.all(userFollowingQuery);
  response.send(
    dbUser.map((each) => convertUserFollowerObjectToResponseObject(each))
  );
});

app.get("/user/followers/", authenticationToken, async (request, response) => {
  const userFollowersQuery = `
    select
        user.name
    from
        (user inner join follower on user.user_id = follower.follower_user_id;`;

  const getResult = await db.all(userFollowersQuery);
  response.send(
    getResult.map((object) => convertUserFollowerObjectToResponseObject(object))
  );
});

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const tweetsQuery = `
    select 
        tweet.tweet,
        count(like.tweet_id),
        count(reply.tweet_id),
        tweet.date_time as dateTime
    from 
        (tweet inner join like on tweet.tweet_id = like.tweet_id as t inner join reply on t.tweet_id = reply.tweet_id);`;

  const getResult = await db.get(tweetsQuery);
  if (getResult === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(getResult);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {}
);

module.exports = app;
