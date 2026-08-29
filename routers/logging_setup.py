"""One-time logging configuration for the backend.

Importing this module configures Python's ``logging`` module once (a
root handler writing to stdout, which the server's console/log file
captures). Every router then creates its logger with the usual
``logging.getLogger(__name__)`` pattern. Configuration only happens
once — ``basicConfig`` is a no-op when the root logger already has
handlers, so re-importing this module from several places is safe.
"""

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[logging.StreamHandler()],
)