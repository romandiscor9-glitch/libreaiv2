function requireAuth(req, res, next) {

  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: 'Non authentifié. Veuillez vous connecter.'
    });
  }

  req.userId = req.session.userId;

  next();
}

module.exports = { requireAuth };
