const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config/config');
const supabase = require('../services/supabase');
const router = express.Router();

const authLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_AUTH
});


router.post('/register', authLimiter, async (req,res)=>{
  try {
    const {email,password,username}=req.body||{};

    const {data,error}=await supabase.auth.signUp({
      email,
      password,
      options:{
        data:{username}
      }
    });

    if(error) return res.status(400).json({error:error.message});

    res.status(201).json({
      requiresVerification:true,
      email:data.user.email
    });

  } catch(e){
    res.status(500).json({error:e.message});
  }
});


router.post('/login', authLimiter, async(req,res)=>{
  try {
    const {email,password}=req.body||{};

    const {data,error}=await supabase.auth.signInWithPassword({
      email,
      password
    });

    if(error)
      return res.status(401).json({error:error.message});


    req.session.userId = data.user.id;
    req.session.user = {
      id: data.user.id,
      email: data.user.email,
      username: data.user.user_metadata?.username || ''
    };


    res.json({
      user:req.session.user
    });


  } catch(e){
    res.status(500).json({error:e.message});
  }
});


router.get('/me', async(req,res)=>{

  if(!req.session.user){
    return res.status(401).json({
      error:'Session invalide'
    });
  }

  res.json({
    user:req.session.user
  });

});


router.post('/logout',(req,res)=>{

  req.session.destroy(()=>{
    res.json({ok:true});
  });

});


router.post('/resend-verification', async(req,res)=>{
  res.json({ok:true});
});


module.exports=router;
