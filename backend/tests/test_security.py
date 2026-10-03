from app.core.security import hash_password, hash_token, new_token, verify_password


def test_password_hash_roundtrip():
    hashed = hash_password("clave-segura-123")
    assert hashed != "clave-segura-123"
    assert verify_password(hashed, "clave-segura-123")
    assert not verify_password(hashed, "otra-clave-123")


def test_verify_password_with_garbage_hash_is_false():
    assert not verify_password("no-es-un-hash", "lo-que-sea")


def test_tokens_are_unique_and_hash_is_deterministic():
    a, b = new_token(), new_token()
    assert a != b
    assert len(a) >= 40
    assert hash_token(a) == hash_token(a)
    assert hash_token(a) != hash_token(b)
    assert len(hash_token(a)) == 64
