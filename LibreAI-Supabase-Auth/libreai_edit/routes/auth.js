const express = require('express');
const rateLimit = require('express-rate-limit');

const supabase = require('../services/supabase');
const db = require('../db/database');
const config = require('../config/config');


const router = express.Router();


const authLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_AUTH
});




// REGISTER

router.post('/register', authLimiter, async(req,res)=>{

try {


const {email,password,username}=req.body;


const {data,error}=await supabase.auth.signUp({

email,
password,

options:{
data:{
username
}
}

});


if(error){

return res.status(400).json({
error:error.message
});

}



db.prepare(`
INSERT OR IGNORE INTO users
(
email,
username,
password_hash,
email_verified
)
VALUES
(?,?,?,?)
`)
.run(
email,
username || email.split('@')[0],
'supabase_auth',
0
);



res.json({

requiresVerification:true,

email

});


}catch(e){

console.error(e);

res.status(500).json({
error:'Erreur serveur interne.'
});

}

});





// LOGIN

router.post('/login', authLimiter, async(req,res)=>{


try{


const {email,password}=req.body;



const {data,error}=await supabase.auth.signInWithPassword({

email,
password

});



if(error){

return res.status(401).json({
error:error.message
});

}



let user=db.prepare(
'SELECT * FROM users WHERE email = ? COLLATE NOCASE'
)
.get(email);



if(!user){

const result=db.prepare(`
INSERT INTO users
(
email,
username,
password_hash,
email_verified
)
VALUES
(?,?,?,?)
`)
.run(
email,
data.user.user_metadata?.username || email.split('@')[0],
'supabase_auth',
1
);


user=db.prepare(
'SELECT * FROM users WHERE id=?'
)
.get(result.lastInsertRowid);

}




req.session.userId=user.id;

req.session.access_token=data.session.access_token;



res.json({

user:{

id:user.id,

email:user.email,

username:user.username

}

});



}catch(e){

console.error(e);

res.status(500).json({
error:'Erreur serveur interne.'
});

}


});





// ME

router.get('/me',(req,res)=>{


if(!req.session?.userId){

return res.status(401).json({
error:'Non connecté'
});

}



const user=db.prepare(
'SELECT id,email,username FROM users WHERE id=?'
)
.get(req.session.userId);



if(!user){

return res.status(401).json({
error:'Session invalide'
});

}



res.json({
user
});


});





// LOGOUT

router.post('/logout',(req,res)=>{


req.session.destroy(()=>{

res.json({
ok:true
});

});


});



module.exports=router;
