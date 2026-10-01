"""Vercel serverless entrypoint.

Vercel exposes Python functions only under /api/*. Our Flask routes live at the
root (/appointments, /logbook, ...), so we mount the whole app under /api with
DispatcherMiddleware rather than renaming every blueprint.
"""
from werkzeug.middleware.dispatcher import DispatcherMiddleware

from main import app as flask_app

application = DispatcherMiddleware(flask_app, {"/api": flask_app})