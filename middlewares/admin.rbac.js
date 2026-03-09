'use strict';

/**
 * =========================================================
 * ADMIN RBAC MIDDLEWARE
 * =========================================================
 * Assumes:
 * - requireAdminAuth has already run
 * - req.admin is populated with:
 *   {
 *     adminId,
 *     adminUuid,
 *     role,
 *     sessionId
 *   }
 * =========================================================
 */

/**
 * Require exactly ONE role
 * Example: requireRole('super_admin')
 */
exports.requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    if (req.admin.role !== requiredRole) {
      console.warn('[ADMIN_RBAC_DENY]', {
        adminId: req.admin.adminId,
        role: req.admin.role,
        required: requiredRole
      });

      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    return next();
  };
};

/**
 * Require ANY role from a list
 * Example: requireAnyRole(['finance', 'super_admin'])
 */
exports.requireAnyRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
      console.error('[ADMIN_RBAC_CONFIG_ERROR] allowedRoles empty');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    if (!allowedRoles.includes(req.admin.role)) {
      console.warn('[ADMIN_RBAC_DENY]', {
        adminId: req.admin.adminId,
        role: req.admin.role,
        allowed: allowedRoles
      });

      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    return next();
  };
};