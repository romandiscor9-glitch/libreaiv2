const db = require('../db/database');
const config = require('../config/config');


function isAdminUser(user) {
  return Boolean(user && user.is_admin === 1);
}


// Récupère l'utilisateur SQLite lié à Supabase
function getOrCreateUser(userId) {

  let user = db.prepare(
    'SELECT * FROM users WHERE supabase_id = ?'
  ).get(userId);


  if (!user) {

    db.prepare(`
      INSERT INTO users (
        supabase_id,
        email,
        username,
        password_hash,
        is_active,
        is_admin,
        email_verified,
        credits,
        credits_reset_at
      )
      VALUES (?, ?, ?, ?, 1, 0, 1, ?, date('now'))
    `).run(
      userId,
      `user_${userId}@supabase.local`,
      'Utilisateur',
      'supabase',
      config.DAILY_CREDITS
    );


    user = db.prepare(
      'SELECT * FROM users WHERE supabase_id = ?'
    ).get(userId);

  }


  return user;
}



function refreshUserCredits(userId) {

  const user = getOrCreateUser(userId);

  if (!user) return null;


  if (isAdminUser(user)) {

    return {
      ...user,
      credits: null,
      unlimited: true
    };

  }


  const today = new Date()
    .toISOString()
    .slice(0, 10);



  if (user.credits_reset_at !== today) {

    db.prepare(`
      UPDATE users
      SET credits = ?,
          credits_reset_at = date('now')
      WHERE supabase_id = ?
    `).run(
      config.DAILY_CREDITS,
      userId
    );


    return {
      ...user,
      credits: config.DAILY_CREDITS,
      credits_reset_at: today,
      unlimited: false
    };

  }


  return {
    ...user,
    unlimited: false
  };

}



function getCreditStatus(userId) {

  const user = refreshUserCredits(userId);

  if (!user) return null;


  return {

    credits: user.unlimited ? null : user.credits,

    unlimited: user.unlimited,

    dailyCredits: config.DAILY_CREDITS,

    chatCost: config.CHAT_CREDIT_COST,

    imageCost: config.IMAGE_CREDIT_COST

  };

}



function chargeCredits(userId, cost) {

  const user = refreshUserCredits(userId);


  if (!user) {

    return {
      ok: false,
      reason: 'user_not_found'
    };

  }



  if (user.unlimited) {

    return {
      ok: true,
      unlimited: true,
      credits: null
    };

  }



  const result = db.prepare(`
    UPDATE users
    SET credits = credits - ?
    WHERE supabase_id = ?
    AND credits >= ?
  `).run(
    cost,
    userId,
    cost
  );



  if (result.changes !== 1) {

    const latest = refreshUserCredits(userId);

    return {
      ok: false,
      reason: 'insufficient',
      credits: latest ? latest.credits : 0
    };

  }



  return {

    ok: true,

    unlimited: false,

    credits: user.credits - cost

  };

}



function refundCredits(userId, cost) {

  const user = refreshUserCredits(userId);


  if (!user || user.unlimited) return;



  db.prepare(`
    UPDATE users
    SET credits = MIN(?, credits + ?)
    WHERE supabase_id = ?
  `).run(
    config.DAILY_CREDITS,
    cost,
    userId
  );

}



module.exports = {
  refreshUserCredits,
  getCreditStatus,
  chargeCredits,
  refundCredits,
  isAdminUser
};
