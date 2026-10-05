"""Portable hosting entrypoint: python -m app.start."""
import os
import uvicorn


def hosting_port() -> int:
    try:
        port = int(os.environ.get('PORT', '8000'))
    except ValueError as error:
        raise ValueError('PORT must be an integer between 1 and 65535') from error
    if not 1 <= port <= 65535:
        raise ValueError('PORT must be an integer between 1 and 65535')
    return port


def main() -> None:
    uvicorn.run('app.main:app', host='0.0.0.0', port=hosting_port(), workers=1)


if __name__ == '__main__':
    main()
