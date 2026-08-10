//! CRYSTALS-Kyber768 KEM for quantum-resistant DM session key encapsulation.

use pqcrypto_kyber::kyber768;
use pqcrypto_traits::kem::{Ciphertext, PublicKey, SecretKey, SharedSecret};
use std::slice;

const PK_LEN: usize = kyber768::public_key_bytes();
const SK_LEN: usize = kyber768::secret_key_bytes();
const CT_LEN: usize = kyber768::ciphertext_bytes();
const SS_LEN: usize = kyber768::shared_secret_bytes();

/// Generate Kyber768 keypair. Returns 0 on success, -1 on buffer error.
#[no_mangle]
pub extern "C" fn status_kyber768_keypair(pk_out: *mut u8, sk_out: *mut u8) -> i32 {
    if pk_out.is_null() || sk_out.is_null() {
        return -1;
    }
    let (pk, sk) = kyber768::keypair();
    unsafe {
        slice::from_raw_parts_mut(pk_out, PK_LEN).copy_from_slice(pk.as_bytes());
        slice::from_raw_parts_mut(sk_out, SK_LEN).copy_from_slice(sk.as_bytes());
    }
    0
}

/// Encapsulate shared secret to recipient public key.
/// Writes ciphertext (CT_LEN) and shared secret (SS_LEN). Returns 0 on success.
#[no_mangle]
pub extern "C" fn status_kyber768_encapsulate(
    pk_in: *const u8,
    ct_out: *mut u8,
    ss_out: *mut u8,
) -> i32 {
    if pk_in.is_null() || ct_out.is_null() || ss_out.is_null() {
        return -1;
    }
    let pk_bytes = unsafe { slice::from_raw_parts(pk_in, PK_LEN) };
    let pk = match kyber768::PublicKey::from_bytes(pk_bytes) {
        Ok(k) => k,
        Err(_) => return -2,
    };
    let (ss, ct) = kyber768::encapsulate(&pk);
    unsafe {
        slice::from_raw_parts_mut(ct_out, CT_LEN).copy_from_slice(ct.as_bytes());
        slice::from_raw_parts_mut(ss_out, SS_LEN).copy_from_slice(ss.as_bytes());
    }
    0
}

/// Decapsulate shared secret from ciphertext using secret key.
#[no_mangle]
pub extern "C" fn status_kyber768_decapsulate(
    sk_in: *const u8,
    ct_in: *const u8,
    ss_out: *mut u8,
) -> i32 {
    if sk_in.is_null() || ct_in.is_null() || ss_out.is_null() {
        return -1;
    }
    let sk_bytes = unsafe { slice::from_raw_parts(sk_in, SK_LEN) };
    let ct_bytes = unsafe { slice::from_raw_parts(ct_in, CT_LEN) };
    let sk = match kyber768::SecretKey::from_bytes(sk_bytes) {
        Ok(k) => k,
        Err(_) => return -2,
    };
    let ct = match kyber768::Ciphertext::from_bytes(ct_bytes) {
        Ok(c) => c,
        Err(_) => return -3,
    };
    let ss = kyber768::decapsulate(&ct, &sk);
    unsafe {
        slice::from_raw_parts_mut(ss_out, SS_LEN).copy_from_slice(ss.as_bytes());
    }
    0
}

/// Expose constant sizes to Dart FFI.
#[no_mangle]
pub extern "C" fn status_kyber768_sizes(out: *mut u32) {
    if out.is_null() {
        return;
    }
    unsafe {
        *out = PK_LEN as u32;
        *out.add(1) = SK_LEN as u32;
        *out.add(2) = CT_LEN as u32;
        *out.add(3) = SS_LEN as u32;
    }
}
