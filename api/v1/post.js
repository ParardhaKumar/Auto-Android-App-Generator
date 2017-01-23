let express = require('express');
let formidable = require('formidable');
let bluebird = require('bluebird');
let type = require('type-is');
let mongoose = require('mongoose');

let Post = require('../../models/post');
let Likes = require('../../models/likes');
let Comments = require('../../models/comment');
let CommentsLikes = require('../../models/comments_likes');
let CommentsReplies = require('../../models/replies');
let Replies = require('../../models/replies');

let router = express.Router();

router.post("/likes",function (req,res) {
    let appId = req.body.appId;
    let userId = req.body.userId;
    let postId = req.body.postId;

    Likes.findOne({'postId': postId, 'userId': userId}).exec().then(function (like) {
        if (like) {
            Likes.findOne({'postId': postId, 'userId': userId}).remove().exec().then(function () {
                return res.json({'message': 'remove like', 'statusCode': 200});
            })
        } else {
            let newLike = new Likes();
            newLike.appId = appId;
            newLike.postId = postId;
            newLike.userId = userId;
            return newLike.save();
        }
    }).then(function (like) {
        if (like) {
            return res.json({
                'message': 'Like Successfull',
                statusCode: 200,
                _id: like._id
            });
        }
        return;
    }).catch(function (error) {
        console.log(error);
        return res.json({
            'message': "Like Failed , Server Error",
            statusCode: 500
        });
    });
});

router.post("/comments",function (req,res) {
    let appId = req.body.appId;
    let userId = req.body.userId;
    let postId = req.body.postId;
    let comment = req.body.comment;
    let timestamp = req.body.timestamp;
    let commentId = req.body._id;

    Comments.findOne({'_id': commentId}).exec().then(function (comment) {
        if (comment) {
            // have to update here
            Comments.findOne({'_id': commentId}).remove().exec().then(function () {
                let newComment = new Comments();
                newComment.appId = appId;
                newComment.postId = postId;
                newComment.userId = userId;
                newComment.timestamp = timestamp;
                newComment.comment = comment;
                newComment._id = commentId;
                return newComment.save();
            }).then(function (commment) {
                return res.json({'message': 'Updated comment', 'statusCode': 200});
            })
        }else{
            let newComment = new Comments();
            newComment.appId = appId;
            newComment.postId = postId;
            newComment.userId = userId;
            newComment.timestamp = timestamp;
            newComment.comment = comment;
            return newComment.save();
        }

    }).then(function (comment) {
        if (user) {
            return res.json({
                'message': 'Comment Successfull',
                statusCode: 200,
                _id: user._id
            });
        }
        return;
    }).catch(function (error) {
        console.log(error);
        return res.json({
            'message': "Comment Failed , Server Error",
            statusCode: 500
        });
    });
});

router.post("/comments/likes",function (req, res) {
    let userId = req.body.userId;
    let commentId = req.body.commentId;
    let postId = req.body.postId;

    CommentsLikes.findOne({'userId':userId,'commentId': commentId,'postId':postId}).exec().then(function (commentLikes) {
        if(commentLikes!=null){
            CommentsLikes.findOne({'userId':userId,'commentId': commentId,'postId':postId}).remove().then()
        }
    })
})

router.post("/", function (req, res, next) {

    // Check the Content-Type of post , if the Content-Type is not multipart-form data then
    // this is a plain post request without any multimedia data , if it is a multipart request
    // then we let the next route handler handle this request.

    let contentType = type(req, ['multipart/*']);

    if (contentType !== 'multipart/form-data') {
        bluebird.coroutine(function *() {
            try {
                let newPost = parsePostData(req.body);
                let savedPost = yield savePost(newPost);

                return sendResult(res, savedPost);
            } catch (error) {
                return sendError(res, error);
            }
        })();
    }
    else {
        // Content-Type is multipart/form-data forward to the next handler
        next();
    }

}, function (req, res) {

    bluebird.coroutine(function *() {
        try {
            let fieldsNFiles = yield parseForm(req);

            let fields = fieldsNFiles.fields;
            let files = fieldsNFiles.files;

            let newPost = parsePostData(fields);

            // Get the path to the resource
            let locationUri = "";

            if (files.postData)
                locationUri = files.postData.path;

            newPost.locationUri = locationUri;

            let savedPost = yield savePost(newPost);
            return sendResult(res, savedPost);

        } catch (error) {
            return sendError(res, error);
        }
    })();

});

router.get('/', function (req, res) {

    let timestamp = req.body.timestamp;
    let appId = req.body.appId;


    // Use generator functions for getting posts and comments and likes
    bluebird.coroutine(function *() {
        // Get the posts array based on app id
        let posts = yield Post.find({appId: mongoose.Types.ObjectId(appId), timestamp: {$lt: timestamp}}).sort({timestamp: 1}).exec();

        // Map the post array to an array of promises each querying for comments
        let commentsPromise = Promise.all(posts.map(function (post, idx) {
            return Comments.find({appId: appId, postId: post._id}).exec();
        }));

        // Map the post array to likesPromises array similar to comments promises array
        let likesPromise = Promise.all(posts.map(function (post, idx) {
            return Likes.find({appId: appId, postId: post._id}).exec();
        }));

        // Get the comments from commentsPromises
        let comments = yield commentsPromise;

        // Get the likes from likesPromises
        let likes = yield likesPromise;

        // For each comment find the replies and likes
        let repliesPromise = Promise.all(comments.map(function (postComments) {
            let promises = postComments.map(function (comment) {
                return Replies.find({appId : appId , commentId : comment._id}).sort({timestamp : 1}).exec();
            });
            return Promise.all(promises);
        }));

        let commentLikesPromise = Promise.all(comments.map(function (postComments) {
            let promises = postComments.map(function (comment) {
                return Replies.find({appId : appId , commentId : comment._id}).sort({timestamp : 1}).exec();
            });
            return Promise.all(promises);
        }));

        let replies = yield repliesPromise;
        let commentLikes = yield commentLikesPromise;

        let responseArray = [];

        for (let i=0 ; i <posts.length ; i++){

            let post = {
                userId: posts[i].userId,
                mimeType: posts[i].mimeType,
                timestamp: posts[i].timestamp,
                locationUri: posts[i].locationUri,
                description: posts[i].description,
                likes : likes[i]
            };

            post.comments = [];

            for (let j =0 ; j< comments[i].length ; j++){
                let comment = comments[i];

                comment.replies = replies[i][j];
                comment.likes = commentLikes[i][j];

                post.comments.push(comment);
            }

            responseArray.push(post);
        }

        console.log(responseArray);

        return res.json(responseArray);

    })();
});

// Helper functions
function parsePostData(object) {

    let appId = object.appId;
    let userId = object.userId;
    let mimeType = object.mimeType;
    let timestamp = object.timestamp;
    let description = object.description;

    if (!appId) {
        throw {message: "appId not found"}
    }

    if (!userId) {
        throw {message: "userId not found"}
    }

    let newPost = new Post();

    newPost.appId = appId;
    newPost.userId = userId;
    newPost.mimeType = mimeType;
    newPost.timestamp = timestamp;
    newPost.description = description;

    return newPost;
}

function savePost(post) {
    return post.save();
}

function parseForm(req) {

    return new Promise(function (resolve, reject) {

        let form = formidable.IncomingForm();

        form.parse(req, function (error, fields, files) {
            if (!error) {
                let result = {
                    fields: fields,
                    files: files
                };

                resolve(result);
            }
            else {
                reject(error);
            }
        });
    });
}

function sendResult(res, post) {
    if (post) {
        res.json({message: "Successfully posted"});
    }
}

function sendError(res, error) {
    res.json({message: error.message});
}
module.exports = router;
