const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
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
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const validatePassword = (password) => {
  return password.length > 6;
};

const convertUserFollowerObjectToResponseObject = (object) => {
  return {
    name: object.name,
  };
};

const convertEachUserObjectToResponseObject = (userObject) => {
  return {
    username: userObject.username,
    tweet: userObject.tweet,
    dateTime: userObject.dateTime,
  };
};
const convertEachUserTweetToResponseObject = (userTweet) => {
  return {
    tweet: userTweet.tweet,
    likes: userTweet.likes,
    replies: userTweet.replies,
    dateTime: userTweet.dateTime,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// API 1

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
      response.send("Password is too short ");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
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

// API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = `select user_id from user where username = '${username}';`;

  const result = await db.get(getUserId);

  const tweetsQuery = `
  SELECT 
    user.username, tweet.tweet, tweet.date_time AS dateTime
  FROM
    follower
  INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
  INNER JOIN user
    ON tweet.user_id = user.user_id
  WHERE 
    follower.follower_user_id = ${result.user_id}
  ORDER BY 
    tweet.date_time DESC
  LIMIT 4;`;

  const dbUser = await db.all(tweetsQuery);
  response.send(
    dbUser.map((object) => convertEachUserObjectToResponseObject(object))
  );
});

// API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserName = `select user_id from user where username = '${username}';`;

  const result = await db.get(getUserName);

  const tweetsQuery = `
    select user.name 
    from 
        user inner join follower on user.user_id = follower.following_user_id
    where follower.follower_user_id = ${result.user_id};`;

  const dbUser = await db.all(tweetsQuery);
  response.send(
    dbUser.map((object) => convertUserFollowerObjectToResponseObject(object))
  );
});

// API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserName = `select user_id from user where username='${username}';`;

  const result = await db.get(getUserName);

  const tweetsQuery = `
        select user.name
        from user inner join follower on user.user_id = follower.follower_user_id
        where
            follower.following_user_id = ${result.user_id};`;

  const dbUser = await db.all(tweetsQuery);
  response.send(
    dbUser.map((object) => convertUserFollowerObjectToResponseObject(object))
  );
});

// API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const getUserName = `select user_id from user where username='${username}';`;

  const result = await db.get(getUserName);

  if (result.user_id === tweetId) {
    const tweetsQuery = `
    select 
        tweet.tweet,
        count(${result.user_id}) as likes,
        count(${result.user_id}) as replies,
        tweet.date_time as dateTime
    from 
        tweet inner join like on tweet.user_id = like.user_id
        inner join reply on tweet.user_id = reply.user_id
    where
        tweet.tweet_id = ${tweetId};`;

    const dbUser = await db.get(tweetsQuery);
    response.send(dbUser);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserId = `select user_id from user where username='${username}';`;

    const result = await db.get(getUserId);
    console.log(result.user_id);

    if (result.user_id === tweetId) {
      const tweetsQuery = `
            select *
            from 
                tweet inner join like on tweet.tweet_id = like.tweet_id
                inner join follower on follower.following_user_id = tweet.user_id
            where
                tweet.tweet_id = ${tweetId};`;

      const dbUser = await db.get(tweetsQuery);
      response.send(dbUser);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserName = `select user_id from user where username='${username}';`;

  const result = await db.get(getUserName);

  const tweetsQuery = `
   SELECT 
   tweet,
   (
       SELECT COUNT(like_id)
       FROM like
       WHERE tweet_id=tweet.tweet_id
   ) AS likes,
   (
       SELECT COUNT(reply_id)
       FROM reply
       WHERE tweet_id=tweet.tweet_id  
   ) AS replies,
   date_time AS dateTime
   FROM tweet
   WHERE user_id= ${result.user_id}
   `;

  const dbUser = await db.all(tweetsQuery);
  response.send(dbUser);
});

// API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const tweetsQuery = `
    insert into 
        tweet (tweet)
    values
        ('${tweet}');`;

  await db.run(tweetsQuery);
  response.send("Created a Tweet");
});

// API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserId = `select user_id from user where username='${username}';`;
    const result = await db.get(getUserId);

    if (result.user_id === parseInt(tweetId)) {
      const deleteQuery = `
        delete 
        from 
            tweet
        where
            tweet.tweet_id = ${tweetId};`;

      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
